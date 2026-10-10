//! Lobby: direct invites between teams and a quick-match queue.

use crate::auth::require_user;
use crate::games;
use crate::state::{Stored, Store};
use crate::teams::team_view;
use crate::types::*;
use candid::Principal;

/// Checks the per-mode proof-of-human switch. Every mode is open at launch;
/// turning World ID on later is a settings change.
pub fn check_policy(s: &Store, user: &User, mode: GameMode) -> Res<()> {
    let policy = s.settings().game_modes.into_iter().find(|p| p.mode == mode);
    if let Some(required) = policy.and_then(|p| p.requires_verification) {
        let ok = user.verifications.iter().any(|v| v.level >= required);
        if !ok {
            return Err(format!("{mode:?} games need a verified human ({required:?})"));
        }
    }
    Ok(())
}

fn my_team(s: &Store, user: &User) -> Res<Team> {
    user.team_id.and_then(|id| s.team(id)).ok_or_else(|| "create a team first".to_string())
}

fn request_view(s: &Store, r: &GameRequest) -> Option<GameRequestView> {
    Some(GameRequestView {
        id: r.id,
        from_team: team_view(s, r.from_team)?,
        to_team: team_view(s, r.to_team)?,
        created_at: r.created_at,
        expires_at: r.expires_at,
    })
}

fn close_request(s: &mut Store, now: Timestamp, id: RequestId, reason: &str) {
    if let Some(r) = s.request(id) {
        s.requests.remove(&id);
        if let Some(mut from) = s.team(r.from_team) {
            if from.outgoing_request == Some(id) {
                from.outgoing_request = None;
                s.put_team(from);
            }
        }
        s.emit(now, EventKind::GameRequestClosed { request_id: id, reason: reason.to_string() });
    }
}

pub fn create_request(s: &mut Store, caller: Principal, now: Timestamp, to_team: TeamId) -> Res<GameRequestView> {
    let user = require_user(s, &caller, now)?;
    check_policy(s, &user, GameMode::Invite)?;
    let mut mine = my_team(s, &user)?;
    let target = s.team(to_team).ok_or("team not found")?;
    if target.id == mine.id {
        return Err("you cannot invite your own team".into());
    }
    if mine.active_game.is_some() {
        return Err("finish your current game first".into());
    }
    if target.active_game.is_some() {
        return Err("that team is playing right now".into());
    }
    if let Some(old) = mine.outgoing_request {
        close_request(s, now, old, "replaced");
        mine = s.team(mine.id).expect("team exists");
    }
    s.queue.remove(&mine.id);

    let settings = s.settings();
    let id = s.update_meta(|m| {
        let id = m.next_request_id;
        m.next_request_id += 1;
        id
    });
    let req = GameRequest { id, from_team: mine.id, to_team, created_at: now, expires_at: now + settings.request_ttl_secs * SECOND };
    s.requests.insert(id, Stored(req.clone()));
    mine.outgoing_request = Some(id);
    s.put_team(mine.clone());
    s.emit(now, EventKind::GameRequested { request_id: id, from_team: mine.id, to_team });
    Ok(request_view(s, &req).expect("teams exist"))
}

/// Cancel (by the sender) or decline (by the receiver).
pub fn cancel_request(s: &mut Store, caller: Principal, now: Timestamp, id: RequestId) -> Res<()> {
    let user = require_user(s, &caller, now)?;
    let mine = my_team(s, &user)?;
    let r = s.request(id).ok_or("request not found")?;
    if r.from_team == mine.id {
        close_request(s, now, id, "cancelled");
    } else if r.to_team == mine.id {
        close_request(s, now, id, "declined");
    } else {
        return Err("this request is not yours".into());
    }
    Ok(())
}

pub fn accept_request(s: &mut Store, caller: Principal, now: Timestamp, id: RequestId) -> Res<GameId> {
    let user = require_user(s, &caller, now)?;
    check_policy(s, &user, GameMode::Invite)?;
    let mine = my_team(s, &user)?;
    let r = s.request(id).ok_or("request not found or expired")?;
    if r.to_team != mine.id {
        return Err("this request was not sent to you".into());
    }
    if r.expires_at <= now {
        close_request(s, now, id, "expired");
        return Err("request expired".into());
    }
    let from = s.team(r.from_team).ok_or("team not found")?;
    if from.active_game.is_some() || mine.active_game.is_some() {
        return Err("one of the teams is already playing".into());
    }
    close_request(s, now, id, "accepted");
    if let Some(own) = mine.outgoing_request {
        close_request(s, now, own, "started another game");
    }
    Ok(games::start_game(s, now, from.id, mine.id, GameMode::Invite))
}

/// Joins quick match. Returns the game id if an opponent was waiting.
pub fn join_queue(s: &mut Store, caller: Principal, now: Timestamp) -> Res<Option<GameId>> {
    let user = require_user(s, &caller, now)?;
    check_policy(s, &user, GameMode::Queue)?;
    let mine = my_team(s, &user)?;
    if mine.active_game.is_some() {
        return Err("finish your current game first".into());
    }
    let opponent = s.queue.iter().map(|e| (*e.key(), e.value())).filter(|(t, _)| *t != mine.id).min_by_key(|(_, at)| *at).map(|(t, _)| t);
    match opponent {
        Some(other) => {
            s.queue.remove(&other);
            s.queue.remove(&mine.id);
            if let Some(own) = mine.outgoing_request {
                close_request(s, now, own, "started another game");
            }
            Ok(Some(games::start_game(s, now, other, mine.id, GameMode::Queue)))
        }
        None => {
            s.queue.insert(mine.id, now);
            Ok(None)
        }
    }
}

pub fn leave_queue(s: &mut Store, caller: Principal, now: Timestamp) -> Res<()> {
    let user = require_user(s, &caller, now)?;
    if let Some(t) = user.team_id {
        s.queue.remove(&t);
    }
    Ok(())
}

pub fn lobby(s: &Store, caller: Principal, now: Timestamp) -> Res<Lobby> {
    let user = require_user(s, &caller, now)?;
    let Some(team) = user.team_id.and_then(|t| s.team(t)) else {
        return Ok(Lobby { incoming: vec![], outgoing: vec![], in_queue: false, active_game: None });
    };
    let mut incoming = vec![];
    let mut outgoing = vec![];
    for r in s.requests.values().map(|r| r.0).filter(|r| r.expires_at > now) {
        if r.to_team == team.id {
            incoming.extend(request_view(s, &r));
        } else if r.from_team == team.id {
            outgoing.extend(request_view(s, &r));
        }
    }
    Ok(Lobby { incoming, outgoing, in_queue: s.queue.contains_key(&team.id), active_game: team.active_game })
}

/// Timer job: drops expired invites and stale queue entries.
pub fn expire(s: &mut Store, now: Timestamp) {
    let expired: Vec<RequestId> = s.requests.values().map(|r| r.0).filter(|r| r.expires_at <= now).map(|r| r.id).collect();
    for id in expired {
        close_request(s, now, id, "expired");
    }
    let ttl = s.settings().request_ttl_secs * SECOND;
    let stale: Vec<TeamId> = s.queue.iter().filter(|e| e.value() + ttl <= now).map(|e| *e.key()).collect();
    for t in stale {
        s.queue.remove(&t);
    }
}
