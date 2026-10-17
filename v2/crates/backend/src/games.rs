//! Games: hidden simultaneous moves, turn resolution, timeout claims and results.

use crate::auth::require_user;
use crate::ledger;
use crate::state::{Stored, Store};
use crate::types::*;
use candid::Principal;
use sha2::{Digest, Sha256};
use tactiball_engine::{new_game_board, rating, resolve_turn, validate_moves, Move, Side};

fn game_team(s: &Store, team_id: TeamId) -> GameTeam {
    let t = s.team(team_id).expect("team exists");
    let home_chain = s.user(t.owner).map(|u| u.home_chain).unwrap_or_default();
    GameTeam { team_id, user_id: t.owner, name: t.name, country: t.country, home_chain, elo_before: t.elo, elo_after: None }
}

pub fn start_game(s: &mut Store, now: Timestamp, team1: TeamId, team2: TeamId, mode: GameMode) -> GameId {
    let settings = s.settings();
    let id = s.update_meta(|m| {
        let id = m.next_game_id;
        m.next_game_id += 1;
        id
    });
    let game = Game {
        id,
        mode,
        team1: game_team(s, team1),
        team2: game_team(s, team2),
        status: GameStatus::Active,
        winner: None,
        score1: 0,
        score2: 0,
        turns_played: 0,
        max_turns: settings.max_turns,
        board: new_game_board(),
        pending1: None,
        pending2: None,
        created_at: now,
        turn_started_at: now,
        move_timeout_secs: settings.move_timeout_secs,
        finished_at: None,
        version: 1,
        history_hash: vec![0; 32],
    };
    for t in [team1, team2] {
        let mut team = s.team(t).expect("team exists");
        team.active_game = Some(id);
        s.put_team(team);
        s.queue.remove(&t);
        s.team_games.insert((t, id), ());
    }
    s.active_games.insert(id, ());
    s.put_game(game);
    s.emit(now, EventKind::GameStarted { game_id: id, team1, team2 });
    id
}

pub fn side_of(game: &Game, user_id: UserId) -> Option<Side> {
    if game.team1.user_id == user_id {
        Some(Side::Team1)
    } else if game.team2.user_id == user_id {
        Some(Side::Team2)
    } else {
        None
    }
}

pub fn deadline(game: &Game) -> Timestamp {
    game.turn_started_at + game.move_timeout_secs * SECOND
}

pub fn view(game: &Game, viewer: Option<UserId>) -> GameView {
    let my_side = viewer.and_then(|u| side_of(game, u));
    let my_pending = match my_side {
        Some(Side::Team1) => game.pending1.clone(),
        Some(Side::Team2) => game.pending2.clone(),
        None => None,
    };
    GameView {
        id: game.id,
        mode: game.mode,
        team1: game.team1.clone(),
        team2: game.team2.clone(),
        status: game.status,
        winner: game.winner,
        score1: game.score1,
        score2: game.score2,
        turns_played: game.turns_played,
        max_turns: game.max_turns,
        board: game.board.clone(),
        committed1: game.pending1.is_some(),
        committed2: game.pending2.is_some(),
        my_side,
        my_pending,
        created_at: game.created_at,
        turn_started_at: game.turn_started_at,
        turn_deadline: deadline(game),
        finished_at: game.finished_at,
        version: game.version,
    }
}

/// Per-turn seed from the canister's private entropy pool (refreshed from
/// `raw_rand`). Stored with the turn so it can be replayed and checked.
fn turn_seed(s: &Store, game_id: GameId, turn: u32) -> Vec<u8> {
    let mut h = Sha256::new();
    h.update(&s.meta().entropy);
    h.update(game_id.to_be_bytes());
    h.update(turn.to_be_bytes());
    h.finalize().to_vec()
}

/// Deterministic rolls 0..=99 from a seed; replaying with the same seed gives
/// the same clash results.
pub fn roller(seed: Vec<u8>) -> impl FnMut() -> u8 {
    let mut counter: u32 = 0;
    move || {
        let mut h = Sha256::new();
        h.update(&seed);
        h.update(counter.to_be_bytes());
        counter += 1;
        let d = h.finalize();
        (u32::from_be_bytes([d[0], d[1], d[2], d[3]]) % 100) as u8
    }
}

pub fn commit_moves(s: &mut Store, caller: Principal, now: Timestamp, game_id: GameId, turn: u32, moves: Vec<Move>) -> Res<CommitResult> {
    let user = require_user(s, &caller, now)?;
    let mut game = s.game(game_id).ok_or("game not found")?;
    let side = side_of(&game, user.id).ok_or("you are not playing in this game")?;
    if game.status != GameStatus::Active {
        return Err("game is over".into());
    }
    // A late commit still counts: the game only ends on time when the
    // opponent claims it (`claim_timeout_win`).
    if turn != game.turns_played + 1 {
        return Err(format!("expected moves for turn {}, got {}", game.turns_played + 1, turn));
    }
    let slot = match side {
        Side::Team1 => &mut game.pending1,
        Side::Team2 => &mut game.pending2,
    };
    if slot.is_some() {
        return Err("you already committed this turn".into());
    }
    validate_moves(&game.board, side, &moves).map_err(|e| e.to_string())?;
    *slot = Some(moves);
    game.version += 1;

    let resolved = game.pending1.is_some() && game.pending2.is_some();
    if resolved {
        resolve(s, &mut game, now);
    }
    s.put_game(game.clone());
    Ok(CommitResult { resolved, game: view(&game, Some(user.id)) })
}

fn resolve(s: &mut Store, game: &mut Game, now: Timestamp) {
    let turn = game.turns_played + 1;
    let m1 = game.pending1.take().unwrap_or_default();
    let m2 = game.pending2.take().unwrap_or_default();
    let seed = turn_seed(s, game.id, turn);
    let outcome = resolve_turn(&game.board, &m1, &m2, &mut roller(seed.clone()));

    match outcome.goal {
        Some(Side::Team1) => game.score1 += 1,
        Some(Side::Team2) => game.score2 += 1,
        None => {}
    }
    if outcome.goal.is_some() {
        s.update_meta(|m| m.total_goals += 1);
    }
    let record = TurnRecord {
        turn,
        team1_moves: m1,
        team2_moves: m2,
        seed,
        rolls: outcome.rolls,
        frames: outcome.frames,
        goal: outcome.goal,
        resolved_at: now,
    };
    let mut h = Sha256::new();
    h.update(&game.history_hash);
    h.update(candid::encode_one(&record).expect("encode turn"));
    game.history_hash = h.finalize().to_vec();
    s.turns.insert((game.id, turn), Stored(record));

    game.board = outcome.board;
    game.turns_played = turn;
    game.turn_started_at = now;
    game.version += 1;
    s.emit(now, EventKind::TurnResolved { game_id: game.id, turn, score1: game.score1, score2: game.score2 });

    if game.turns_played >= game.max_turns {
        finish(s, game, now, GameStatus::Finished, None);
    }
}

/// Lets a player who moved in time claim a technical 3:0 win once the turn
/// deadline passes and the opponent still hasn't moved. Claiming is optional:
/// until someone claims, the late side may still move and the game goes on.
/// Nothing ends a game on time by itself, even when neither side moves.
pub fn claim_timeout_win(s: &mut Store, caller: Principal, now: Timestamp, game_id: GameId) -> Res<GameView> {
    let user = require_user(s, &caller, now)?;
    let mut game = s.game(game_id).ok_or("game not found")?;
    let side = side_of(&game, user.id).ok_or("you are not playing in this game")?;
    if game.status != GameStatus::Active {
        return Err("game is over".into());
    }
    let (mine, theirs) = match side {
        Side::Team1 => (game.pending1.is_some(), game.pending2.is_some()),
        Side::Team2 => (game.pending2.is_some(), game.pending1.is_some()),
    };
    if !mine {
        return Err("make your move first: only a player who moved in time can claim the win".into());
    }
    if theirs {
        return Err("your opponent has moved".into());
    }
    if now < deadline(&game) {
        return Err(format!("your opponent still has {}s to move", (deadline(&game) - now).div_ceil(SECOND)));
    }
    finish(s, &mut game, now, GameStatus::FinishedByTimeout, Some(side));
    s.put_game(game.clone());
    Ok(view(&game, Some(user.id)))
}

/// `technical_winner` is the side awarded a 3:0 for a timeout or surrender.
fn finish(s: &mut Store, game: &mut Game, now: Timestamp, status: GameStatus, technical_winner: Option<Side>) {
    let mut t1 = s.team(game.team1.team_id).expect("team exists");
    let mut t2 = s.team(game.team2.team_id).expect("team exists");

    match status {
        GameStatus::Finished => {
            game.winner = match game.score1.cmp(&game.score2) {
                core::cmp::Ordering::Greater => Some(Side::Team1),
                core::cmp::Ordering::Less => Some(Side::Team2),
                core::cmp::Ordering::Equal => None,
            };
            let (e1, e2) = rating::new_ratings(game.team1.elo_before, game.team2.elo_before, game.score1, game.score2);
            t1.elo = e1;
            t2.elo = e2;
            game.team1.elo_after = Some(e1);
            game.team2.elo_after = Some(e2);
            t1.goals_for += game.score1 as u64;
            t1.goals_against += game.score2 as u64;
            t2.goals_for += game.score2 as u64;
            t2.goals_against += game.score1 as u64;
        }
        GameStatus::FinishedByTimeout | GameStatus::Surrendered => {
            // Technical 3:0; no ELO change (v1 rule for timeouts).
            let winner = technical_winner.unwrap_or(Side::Team1);
            game.winner = Some(winner);
            (game.score1, game.score2) = if winner == Side::Team1 { (3, 0) } else { (0, 3) };
        }
        GameStatus::Abandoned | GameStatus::Active => {
            game.winner = None;
        }
    }
    if status != GameStatus::Abandoned {
        t1.games += 1;
        t2.games += 1;
        match game.winner {
            Some(Side::Team1) => {
                t1.wins += 1;
                t2.losses += 1;
            }
            Some(Side::Team2) => {
                t2.wins += 1;
                t1.losses += 1;
            }
            None => {
                t1.draws += 1;
                t2.draws += 1;
            }
        }
    }
    t1.active_game = None;
    t2.active_game = None;
    s.put_team(t1);
    s.put_team(t2);

    game.pending1 = None;
    game.pending2 = None;
    game.status = status;
    game.finished_at = Some(now);
    game.version += 1;
    s.active_games.remove(&game.id);
    s.emit(now, EventKind::GameFinished { game_id: game.id, status, score1: game.score1, score2: game.score2, winner: game.winner });
    if status != GameStatus::Abandoned {
        ledger::enqueue_game(s, game, now);
    }
}

/// Lets a player concede: a technical 0:3 loss without ELO change.
pub fn surrender(s: &mut Store, caller: Principal, now: Timestamp, game_id: GameId) -> Res<GameView> {
    let user = require_user(s, &caller, now)?;
    let mut game = s.game(game_id).ok_or("game not found")?;
    let side = side_of(&game, user.id).ok_or("you are not playing in this game")?;
    if game.status != GameStatus::Active {
        return Err("game is over".into());
    }
    finish(s, &mut game, now, GameStatus::Surrendered, Some(side.other()));
    s.put_game(game.clone());
    Ok(view(&game, Some(user.id)))
}

pub fn turns(s: &Store, game_id: GameId, from_turn: u32, limit: u32) -> Vec<TurnRecord> {
    s.turns.range((game_id, from_turn.max(1))..=(game_id, u32::MAX)).take(limit.min(50) as usize).map(|e| e.value().0).collect()
}

pub fn summary(g: &Game) -> GameSummary {
    GameSummary {
        id: g.id,
        team1: g.team1.clone(),
        team2: g.team2.clone(),
        status: g.status,
        winner: g.winner,
        score1: g.score1,
        score2: g.score2,
        created_at: g.created_at,
        finished_at: g.finished_at,
    }
}

pub fn team_games(s: &Store, team_id: TeamId, limit: u32) -> Vec<GameSummary> {
    s.team_games
        .range((team_id, 0)..=(team_id, u64::MAX))
        .map(|e| e.key().1)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .take(limit.min(50) as usize)
        .filter_map(|id| s.game(id).map(|g| summary(&g)))
        .collect()
}

pub fn recent_games(s: &Store, limit: u32) -> Vec<GameSummary> {
    s.games.iter().rev().take(limit.min(50) as usize).map(|e| summary(&e.value().0)).collect()
}
