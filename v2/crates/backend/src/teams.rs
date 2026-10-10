//! Teams: one per user, names unique across every chain (case-insensitive).

use crate::auth::require_user;
use crate::state::Store;
use crate::types::*;
use candid::Principal;
use tactiball_engine::rating::DEFAULT_RATING;

pub const NAME_MIN: usize = 3;
pub const NAME_MAX: usize = 24;

pub fn clean_name(name: &str) -> Res<String> {
    let collapsed = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let len = collapsed.chars().count();
    if !(NAME_MIN..=NAME_MAX).contains(&len) {
        return Err(format!("team name must be {NAME_MIN}-{NAME_MAX} characters"));
    }
    if !collapsed.chars().all(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.' | '\'')) {
        return Err("team name may use letters, numbers, spaces and - _ . '".into());
    }
    Ok(collapsed)
}

pub fn create_team(s: &mut Store, caller: Principal, now: Timestamp, name: String, country: u16) -> Res<TeamView> {
    let mut user = require_user(s, &caller, now)?;
    if user.team_id.is_some() {
        return Err("you already have a team".into());
    }
    let name = clean_name(&name)?;
    let key = name.to_lowercase();
    if s.team_names.contains_key(&key) {
        return Err("this team name is taken".into());
    }
    let id = s.update_meta(|m| {
        let id = m.next_team_id;
        m.next_team_id += 1;
        id
    });
    let team = Team {
        id,
        owner: user.id,
        name: name.clone(),
        country,
        elo: DEFAULT_RATING,
        created_at: now,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        active_game: None,
        outgoing_request: None,
    };
    s.put_team(team);
    s.team_names.insert(key, id);
    user.team_id = Some(id);
    s.put_user(user.clone());
    s.emit(now, EventKind::TeamCreated { team_id: id, user_id: user.id, name });
    Ok(team_view(s, id).expect("team just created"))
}

pub fn view_of(s: &Store, t: &Team) -> TeamView {
    let owner = s.user(t.owner);
    TeamView {
        id: t.id,
        name: t.name.clone(),
        country: t.country,
        elo: t.elo,
        home_chain: owner.as_ref().map(|u| u.home_chain.clone()).unwrap_or_default(),
        verified_human: owner.map(|u| !u.verifications.is_empty()).unwrap_or(false),
        games: t.games,
        wins: t.wins,
        draws: t.draws,
        losses: t.losses,
        goals_for: t.goals_for,
        goals_against: t.goals_against,
        active_game: t.active_game,
        created_at: t.created_at,
    }
}

pub fn team_view(s: &Store, id: TeamId) -> Option<TeamView> {
    s.team(id).map(|t| view_of(s, &t))
}

/// Teams ordered by ELO (then fewer games, then older). A full scan is fine
/// for a PoC; a sorted index can replace it when the pool grows.
pub fn leaderboard(s: &Store, offset: u64, limit: u64) -> Vec<TeamView> {
    let mut teams: Vec<Team> = s.teams.values().map(|t| t.0).collect();
    teams.sort_by(|a, b| b.elo.cmp(&a.elo).then(b.wins.cmp(&a.wins)).then(a.id.cmp(&b.id)));
    teams.iter().skip(offset as usize).take(limit.min(100) as usize).map(|t| view_of(s, t)).collect()
}

pub fn search(s: &Store, query: &str, limit: u64) -> Vec<TeamView> {
    let q = query.trim().to_lowercase();
    let limit = limit.min(50) as usize;
    if q.is_empty() {
        return leaderboard(s, 0, limit as u64);
    }
    let mut hits: Vec<TeamView> = s
        .team_names
        .iter()
        .filter(|e| e.key().contains(&q))
        .filter_map(|e| team_view(s, e.value()))
        .collect();
    hits.sort_by_key(|t| (!t.name.to_lowercase().starts_with(&q), t.name.len()));
    hits.truncate(limit);
    hits
}
