//! Board, moves and turn resolution.
//!
//! Field coordinates match v1: playable cells are x = 1..=15, y = 0..=10.
//! The gates are the columns x = 0 (team 1 defends) and x = 16 (team 2
//! defends) for y = 3..=7; only the ball (pass or shot) may enter them.

use serde::{Deserialize, Serialize};

pub const FIELD_WIDTH: i32 = 15;
pub const FIELD_HEIGHT: i32 = 11;
pub const PLAYERS_PER_TEAM: usize = 6;

pub const DISTANCE_PASS: i32 = 3;
pub const DISTANCE_SHOT: i32 = 4;
pub const DISTANCE_RUN: i32 = 2;
pub const DISTANCE_TACKLE: i32 = 1;

/// Rolls are 0..=99; team 1 wins a random clash when the roll is below this.
pub const CLASH_TEAM1_WINS_BELOW: u8 = 50;

#[cfg_attr(feature = "candid", derive(candid::CandidType))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Side {
    Team1,
    Team2,
}

impl Side {
    pub fn other(self) -> Side {
        match self {
            Side::Team1 => Side::Team2,
            Side::Team2 => Side::Team1,
        }
    }
}

#[cfg_attr(feature = "candid", derive(candid::CandidType))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MoveType {
    Pass,
    Tackle,
    Run,
    Shot,
}

impl MoveType {
    pub fn distance(self) -> i32 {
        match self {
            MoveType::Pass => DISTANCE_PASS,
            MoveType::Shot => DISTANCE_SHOT,
            MoveType::Run => DISTANCE_RUN,
            MoveType::Tackle => DISTANCE_TACKLE,
        }
    }

    /// Pass and shot move the ball, not the player.
    pub fn moves_ball(self) -> bool {
        matches!(self, MoveType::Pass | MoveType::Shot)
    }
}

#[cfg_attr(feature = "candid", derive(candid::CandidType))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Pos {
    pub x: u8,
    pub y: u8,
}

impl Pos {
    pub const fn new(x: u8, y: u8) -> Self {
        Pos { x, y }
    }
}

#[cfg_attr(feature = "candid", derive(candid::CandidType))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Move {
    pub player_id: u8,
    pub move_type: MoveType,
    pub from: Pos,
    pub to: Pos,
}

#[cfg_attr(feature = "candid", derive(candid::CandidType))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Board {
    pub team1: Vec<Pos>,
    pub team2: Vec<Pos>,
    pub ball: Pos,
    pub ball_owner: Option<Side>,
}

#[cfg_attr(feature = "candid", derive(candid::CandidType))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum FrameKind {
    StartPositions,
    Move,
    /// Team 1 scored.
    GoalTeam1,
    /// Team 2 scored.
    GoalTeam2,
}

/// One rendered step of a turn, used by the frontend to animate it.
#[cfg_attr(feature = "candid", derive(candid::CandidType))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Frame {
    pub kind: FrameKind,
    pub board: Board,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TurnOutcome {
    /// Every intermediate state; the last one is the new board.
    pub frames: Vec<Frame>,
    pub board: Board,
    /// The team that scored this turn, if any.
    pub goal: Option<Side>,
    /// Random rolls (0..=99) consumed by clashes, in order.
    pub rolls: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MoveError {
    pub side: Side,
    pub player_id: Option<u8>,
    pub message: String,
}

impl core::fmt::Display for MoveError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self.player_id {
            Some(id) => write!(f, "{:?} player {}: {}", self.side, id, self.message),
            None => write!(f, "{:?}: {}", self.side, self.message),
        }
    }
}

fn err(side: Side, player_id: Option<u8>, message: impl Into<String>) -> MoveError {
    MoveError { side, player_id, message: message.into() }
}

/// Kick-off positions. The team with the ball has its forward on the centre
/// spot (8, 5); this mirrors `fillStartPositions` in v1.
pub fn start_positions(team_with_ball: Side) -> Board {
    let p = Pos::new;
    match team_with_ball {
        Side::Team1 => Board {
            team1: vec![p(1, 5), p(4, 2), p(4, 8), p(6, 3), p(6, 7), p(8, 5)],
            team2: vec![p(15, 5), p(12, 2), p(12, 8), p(10, 2), p(10, 8), p(10, 5)],
            ball: p(8, 5),
            ball_owner: Some(Side::Team1),
        },
        Side::Team2 => Board {
            team1: vec![p(1, 5), p(4, 2), p(4, 8), p(6, 2), p(6, 8), p(6, 5)],
            team2: vec![p(15, 5), p(12, 2), p(12, 8), p(10, 3), p(10, 7), p(8, 5)],
            ball: p(8, 5),
            ball_owner: Some(Side::Team2),
        },
    }
}

/// A new game starts with team 1 (the side that sent the invite) on the ball,
/// as in the v1 contract.
pub fn new_game_board() -> Board {
    start_positions(Side::Team1)
}

pub fn is_in_gates(x: i32, y: i32) -> bool {
    (x == 0 || x == FIELD_WIDTH + 1) && (3..=7).contains(&y)
}

fn in_field(x: i32, y: i32) -> bool {
    (1..=FIELD_WIDTH).contains(&x) && (0..FIELD_HEIGHT).contains(&y)
}

/// The gate the ball is in: `Team1` means team 1's own gate (x = 0), so team 2 scores.
pub fn gate_at(pos: Pos) -> Option<Side> {
    let (x, y) = (pos.x as i32, pos.y as i32);
    if !is_in_gates(x, y) {
        return None;
    }
    if x == 0 {
        Some(Side::Team1)
    } else {
        Some(Side::Team2)
    }
}

/// All cells from `from` (exclusive) towards `to` (inclusive) along a straight
/// or diagonal line, stopping at the field edge. Same as v1 `calculatePath`.
pub fn path(from: Pos, to: Pos, move_type: MoveType) -> Vec<Pos> {
    path_to(from, to.x as i32, to.y as i32, move_type)
}

fn path_to(from: Pos, tx: i32, ty: i32, move_type: MoveType) -> Vec<Pos> {
    let (fx, fy) = (from.x as i32, from.y as i32);
    let dx = tx - fx;
    let dy = ty - fy;
    let step_x = dx.signum();
    let step_y = dy.signum();
    let steps = dx.abs().max(dy.abs());
    let mut cells = Vec::new();
    for i in 1..=steps {
        let x = fx + step_x * i;
        let y = fy + step_y * i;
        if in_field(x, y) || (move_type.moves_ball() && is_in_gates(x, y)) {
            cells.push(Pos::new(x as u8, y as u8));
        } else {
            break;
        }
    }
    cells
}

/// Cells a player may target, for UI highlighting. Mirrors v1
/// `calculateAvailableCells`: run and tackle skip cells held by teammates.
pub fn available_cells(board: &Board, side: Side, player_id: u8, move_type: MoveType) -> Vec<Pos> {
    let team = team_of(board, side);
    let Some(&current) = team.get(player_id as usize) else {
        return Vec::new();
    };
    let d = move_type.distance();
    let dirs = [(0, -d), (d, 0), (0, d), (-d, 0), (-d, -d), (d, -d), (-d, d), (d, d)];
    let mut cells = Vec::new();
    for (dx, dy) in dirs {
        for cell in path_to(current, current.x as i32 + dx, current.y as i32 + dy, move_type) {
            if matches!(move_type, MoveType::Run | MoveType::Tackle) && team.contains(&cell) {
                continue;
            }
            cells.push(cell);
        }
    }
    if move_type == MoveType::Tackle {
        cells.push(current);
    }
    cells
}

pub fn team_of(board: &Board, side: Side) -> &Vec<Pos> {
    match side {
        Side::Team1 => &board.team1,
        Side::Team2 => &board.team2,
    }
}

/// The player currently holding the ball, if the ball sits on a player.
/// Matches v1 `restoreState`: team 2 is checked last, so it wins a tie.
pub fn ball_holder(board: &Board) -> Option<(Side, u8)> {
    let mut holder = None;
    for (i, p) in board.team1.iter().enumerate() {
        if *p == board.ball {
            holder = Some((Side::Team1, i as u8));
        }
    }
    for (i, p) in board.team2.iter().enumerate() {
        if *p == board.ball {
            holder = Some((Side::Team2, i as u8));
        }
    }
    holder
}

/// Validates one team's moves for a turn against the current board.
///
/// Stricter than v1 (which trusted the client for most of this): the move
/// must start where the player stands, respect the distance of its type,
/// follow a straight or diagonal line, and only the ball holder may pass or
/// shoot.
pub fn validate_moves(board: &Board, side: Side, moves: &[Move]) -> Result<(), MoveError> {
    if moves.is_empty() {
        return Err(err(side, None, "at least one move is required"));
    }
    if moves.len() > PLAYERS_PER_TEAM {
        return Err(err(side, None, "at most one move per player"));
    }
    let team = team_of(board, side);
    if team.len() != PLAYERS_PER_TEAM {
        return Err(err(side, None, "board is corrupt"));
    }
    let holder = ball_holder(board);
    let mut seen = [false; PLAYERS_PER_TEAM];
    let mut ball_moves = 0;
    let mut destinations: Vec<Pos> = Vec::new();

    for m in moves {
        let id = m.player_id;
        let pid = Some(id);
        if id as usize >= PLAYERS_PER_TEAM {
            return Err(err(side, pid, "unknown player"));
        }
        if seen[id as usize] {
            return Err(err(side, pid, "player already made a move"));
        }
        seen[id as usize] = true;
        if team[id as usize] != m.from {
            return Err(err(side, pid, "move does not start at the player's position"));
        }

        let dx = m.to.x as i32 - m.from.x as i32;
        let dy = m.to.y as i32 - m.from.y as i32;
        let steps = dx.abs().max(dy.abs());
        if !(dx == 0 || dy == 0 || dx.abs() == dy.abs()) {
            return Err(err(side, pid, "moves must be straight or diagonal"));
        }
        let min_steps = if m.move_type == MoveType::Tackle { 0 } else { 1 };
        if steps < min_steps || steps > m.move_type.distance() {
            return Err(err(side, pid, format!("{:?} distance must be {}..={}", m.move_type, min_steps, m.move_type.distance())));
        }
        if steps > 0 && path(m.from, m.to, m.move_type).last() != Some(&m.to) {
            return Err(err(side, pid, "target is outside the field"));
        }

        if m.move_type.moves_ball() {
            if holder != Some((side, id)) || board.ball_owner != Some(side) {
                return Err(err(side, pid, "only the player with the ball can pass or shoot"));
            }
            ball_moves += 1;
        } else {
            if destinations.contains(&m.to) {
                return Err(err(side, pid, "two players cannot move to the same cell"));
            }
            destinations.push(m.to);
        }
    }
    if ball_moves > 1 {
        return Err(err(side, None, "only one pass or shot per turn"));
    }

    // A run or tackle may not end on a teammate who stays where they are.
    for m in moves.iter().filter(|m| !m.move_type.moves_ball()) {
        if m.to == m.from {
            continue;
        }
        for (i, p) in team.iter().enumerate() {
            let moving_away = moves.iter().any(|o| o.player_id as usize == i && !o.move_type.moves_ball() && o.to != o.from);
            if *p == m.to && !moving_away {
                return Err(err(side, Some(m.player_id), "cell is taken by a teammate"));
            }
        }
    }
    Ok(())
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PathKey {
    Player(Side, u8),
    Ball,
}

/// Resolves one simultaneous turn. Moves must already be validated.
///
/// `next_roll` supplies random numbers 0..=99 for clashes; the backend derives
/// them from the IC's `raw_rand` so any turn can be replayed from its seed.
pub fn resolve_turn(
    board: &Board,
    team1_moves: &[Move],
    team2_moves: &[Move],
    next_roll: &mut dyn FnMut() -> u8,
) -> TurnOutcome {
    let mut b = board.clone();
    // v1 `restoreState`: the player standing on the ball holds it.
    let mut holder: Option<(Side, u8)> = ball_holder(&b);
    if let Some((side, _)) = holder {
        b.ball_owner = Some(side);
    }

    let mut paths: Vec<(PathKey, Vec<Pos>, MoveType)> = Vec::new();
    for (side, moves) in [(Side::Team1, team1_moves), (Side::Team2, team2_moves)] {
        for m in moves {
            let key = if m.move_type.moves_ball() { PathKey::Ball } else { PathKey::Player(side, m.player_id) };
            paths.retain(|(k, _, _)| *k != key);
            paths.push((key, path(m.from, m.to, m.move_type), m.move_type));
        }
    }
    let max_len = paths.iter().map(|(_, p, _)| p.len()).max().unwrap_or(0);

    let move_type_of = |paths: &Vec<(PathKey, Vec<Pos>, MoveType)>, side: Side, id: u8| {
        paths.iter().find(|(k, _, _)| *k == PathKey::Player(side, id)).map(|(_, _, t)| *t)
    };

    let mut frames = Vec::new();
    let mut rolls = Vec::new();
    let mut goal = None;
    let mut ball_path_active = true;

    'steps: for i in 0..max_len {
        let mut ball_moved = false;

        for side in [Side::Team1, Side::Team2] {
            for id in 0..PLAYERS_PER_TEAM as u8 {
                if let Some((_, p, _)) = paths.iter().find(|(k, _, _)| *k == PathKey::Player(side, id)) {
                    if let Some(&cell) = p.get(i) {
                        match side {
                            Side::Team1 => b.team1[id as usize] = cell,
                            Side::Team2 => b.team2[id as usize] = cell,
                        }
                        if holder == Some((side, id)) {
                            b.ball = cell;
                            ball_moved = true;
                        }
                    }
                }
            }
        }

        if ball_path_active {
            if let Some((_, p, _)) = paths.iter().find(|(k, _, _)| *k == PathKey::Ball) {
                if let Some(&cell) = p.get(i) {
                    b.ball = cell;
                    ball_moved = true;

                    if let Some(gate) = gate_at(cell) {
                        let scorer = gate.other();
                        frames.push(Frame {
                            kind: if scorer == Side::Team1 { FrameKind::GoalTeam1 } else { FrameKind::GoalTeam2 },
                            board: b.clone(),
                        });
                        goal = Some(scorer);
                        // The team that conceded kicks off.
                        b = start_positions(gate);
                        frames.push(Frame { kind: FrameKind::StartPositions, board: b.clone() });
                        break 'steps;
                    }
                }
            }
        }

        if ball_moved {
            let t1 = b.team1.iter().position(|p| *p == b.ball).map(|i| i as u8);
            let t2 = b.team2.iter().position(|p| *p == b.ball).map(|i| i as u8);
            let previous_owner = b.ball_owner;
            match (t1, t2) {
                (Some(p1), Some(p2)) => {
                    let m1 = move_type_of(&paths, Side::Team1, p1);
                    let m2 = move_type_of(&paths, Side::Team2, p2);
                    let winner = if holder == Some((Side::Team1, p1)) && m2 == Some(MoveType::Tackle) {
                        Side::Team2
                    } else if holder == Some((Side::Team2, p2)) && m1 == Some(MoveType::Tackle) {
                        Side::Team1
                    } else {
                        let roll = next_roll() % 100;
                        rolls.push(roll);
                        if roll < CLASH_TEAM1_WINS_BELOW {
                            Side::Team1
                        } else {
                            Side::Team2
                        }
                    };
                    holder = Some(match winner {
                        Side::Team1 => (Side::Team1, p1),
                        Side::Team2 => (Side::Team2, p2),
                    });
                    b.ball_owner = Some(winner);
                    ball_path_active = false;
                }
                (Some(p1), None) => {
                    holder = Some((Side::Team1, p1));
                    b.ball_owner = Some(Side::Team1);
                    if previous_owner == Some(Side::Team2) {
                        ball_path_active = false;
                    }
                }
                (None, Some(p2)) => {
                    holder = Some((Side::Team2, p2));
                    b.ball_owner = Some(Side::Team2);
                    if previous_owner == Some(Side::Team1) {
                        ball_path_active = false;
                    }
                }
                (None, None) => {}
            }
        }

        frames.push(Frame { kind: FrameKind::Move, board: b.clone() });
    }

    if frames.is_empty() {
        // Every player tackled in place: nothing moves, but the turn still counts.
        frames.push(Frame { kind: FrameKind::Move, board: b.clone() });
    }
    let board = frames.last().map(|f| f.board.clone()).unwrap_or(b);
    TurnOutcome { frames, board, goal, rolls }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mv(player_id: u8, move_type: MoveType, from: (u8, u8), to: (u8, u8)) -> Move {
        Move { player_id, move_type, from: Pos::new(from.0, from.1), to: Pos::new(to.0, to.1) }
    }

    fn no_rolls() -> impl FnMut() -> u8 {
        || panic!("no roll expected")
    }

    #[test]
    fn start_board_has_forward_on_ball() {
        let b = new_game_board();
        assert_eq!(ball_holder(&b), Some((Side::Team1, 5)));
        assert_eq!(b.ball_owner, Some(Side::Team1));
    }

    #[test]
    fn path_stops_at_edge_and_allows_ball_into_gate() {
        assert_eq!(path(Pos::new(2, 5), Pos::new(0, 5), MoveType::Run), vec![Pos::new(1, 5)]);
        assert_eq!(path(Pos::new(2, 5), Pos::new(0, 5), MoveType::Shot), vec![Pos::new(1, 5), Pos::new(0, 5)]);
        // Outside gate posts the ball stops too.
        assert_eq!(path(Pos::new(2, 1), Pos::new(0, 1), MoveType::Shot), vec![Pos::new(1, 1)]);
    }

    #[test]
    fn validation_rejects_bad_moves() {
        let b = new_game_board();
        // Wrong start cell.
        assert!(validate_moves(&b, Side::Team1, &[mv(1, MoveType::Run, (5, 2), (6, 2))]).is_err());
        // Too far.
        assert!(validate_moves(&b, Side::Team1, &[mv(1, MoveType::Run, (4, 2), (7, 2))]).is_err());
        // Knight-like move.
        assert!(validate_moves(&b, Side::Team1, &[mv(1, MoveType::Run, (4, 2), (5, 4))]).is_err());
        // Pass without the ball.
        assert!(validate_moves(&b, Side::Team1, &[mv(1, MoveType::Pass, (4, 2), (6, 2))]).is_err());
        // Team 2 has no ball either.
        assert!(validate_moves(&b, Side::Team2, &[mv(5, MoveType::Shot, (10, 5), (6, 5))]).is_err());
        // Same player twice.
        assert!(validate_moves(&b, Side::Team1, &[mv(1, MoveType::Run, (4, 2), (5, 2)), mv(1, MoveType::Run, (4, 2), (4, 3))]).is_err());
        // Onto a teammate who stays.
        assert!(validate_moves(&b, Side::Team1, &[mv(3, MoveType::Run, (6, 3), (6, 5))]).is_ok());
        assert!(validate_moves(&b, Side::Team1, &[mv(4, MoveType::Run, (6, 7), (8, 5))]).is_err());
        // Two players to one cell.
        assert!(validate_moves(&b, Side::Team1, &[mv(3, MoveType::Run, (6, 3), (6, 5)), mv(4, MoveType::Run, (6, 7), (6, 5))]).is_err());
        // Valid: forward passes, defender runs, keeper tackles in place.
        assert!(validate_moves(&b, Side::Team1, &[mv(5, MoveType::Pass, (8, 5), (8, 2)), mv(1, MoveType::Run, (4, 2), (6, 4)), mv(0, MoveType::Tackle, (1, 5), (1, 5))]).is_ok());
    }

    #[test]
    fn run_with_ball_carries_it() {
        let b = new_game_board();
        let out = resolve_turn(&b, &[mv(5, MoveType::Run, (8, 5), (8, 3))], &[mv(1, MoveType::Run, (12, 2), (11, 2))], &mut no_rolls());
        assert_eq!(out.board.ball, Pos::new(8, 3));
        assert_eq!(out.board.team1[5], Pos::new(8, 3));
        assert_eq!(out.board.ball_owner, Some(Side::Team1));
        assert_eq!(out.frames.len(), 2);
        assert!(out.goal.is_none());
    }

    #[test]
    fn pass_to_open_cell_leaves_loose_ball_owned_by_passer_team() {
        let b = new_game_board();
        let out = resolve_turn(&b, &[mv(5, MoveType::Pass, (8, 5), (8, 2))], &[mv(1, MoveType::Run, (12, 2), (11, 2))], &mut no_rolls());
        assert_eq!(out.board.ball, Pos::new(8, 2));
        assert_eq!(out.board.ball_owner, Some(Side::Team1));
    }

    #[test]
    fn interception_stops_the_ball() {
        let b = new_game_board();
        // Team 2 forward at (10,5) runs to (9,5); team 1 passes along the row through (9,5) to (11,5).
        let out = resolve_turn(&b, &[mv(5, MoveType::Pass, (8, 5), (11, 5))], &[mv(5, MoveType::Run, (10, 5), (9, 5))], &mut no_rolls());
        assert_eq!(out.board.ball, Pos::new(9, 5));
        assert_eq!(out.board.ball_owner, Some(Side::Team2));
    }

    #[test]
    fn tackle_on_ball_carrier_always_wins() {
        let mut b = new_game_board();
        b.team2[5] = Pos::new(9, 4);
        let out = resolve_turn(&b, &[mv(5, MoveType::Run, (8, 5), (9, 5))], &[mv(5, MoveType::Tackle, (9, 4), (9, 5))], &mut no_rolls());
        assert_eq!(out.board.ball_owner, Some(Side::Team2));
        assert!(out.rolls.is_empty());
    }

    #[test]
    fn random_clash_uses_roll() {
        let mut b = new_game_board();
        // Loose ball at (9,5) owned by team 1; both teams run onto it.
        b.ball = Pos::new(9, 5);
        b.ball_owner = Some(Side::Team1);
        b.team1[5] = Pos::new(8, 5);
        b.team2[5] = Pos::new(10, 5);
        let t1 = [mv(5, MoveType::Run, (8, 5), (9, 5))];
        let t2 = [mv(5, MoveType::Run, (10, 5), (9, 5))];
        // Ball does not move, so no clash check this turn (v1 behaviour).
        let out = resolve_turn(&b, &t1, &t2, &mut no_rolls());
        assert!(out.rolls.is_empty());

        // Carrier vs runner: the roll decides.
        let b = new_game_board();
        let t1 = [mv(5, MoveType::Run, (8, 5), (9, 5))];
        let t2 = [mv(5, MoveType::Run, (10, 5), (9, 5))];
        let out = resolve_turn(&b, &t1, &t2, &mut || 10);
        assert_eq!(out.rolls, vec![10]);
        assert_eq!(out.board.ball_owner, Some(Side::Team1));
        let out = resolve_turn(&b, &t1, &t2, &mut || 77);
        assert_eq!(out.board.ball_owner, Some(Side::Team2));
    }

    #[test]
    fn shot_into_gate_scores_and_resets() {
        let mut b = new_game_board();
        b.team1[5] = Pos::new(13, 5);
        b.ball = Pos::new(13, 5);
        b.team2[0] = Pos::new(15, 2); // keeper out of the way
        let out = resolve_turn(&b, &[mv(5, MoveType::Shot, (13, 5), (16, 5))], &[mv(0, MoveType::Run, (15, 2), (15, 1))], &mut no_rolls());
        assert_eq!(out.goal, Some(Side::Team1));
        assert_eq!(out.board, start_positions(Side::Team2));
        let kinds: Vec<_> = out.frames.iter().map(|f| f.kind).collect();
        assert_eq!(kinds, vec![FrameKind::Move, FrameKind::Move, FrameKind::GoalTeam1, FrameKind::StartPositions]);
    }

    #[test]
    fn keeper_blocks_shot() {
        let mut b = new_game_board();
        b.team1[5] = Pos::new(13, 5);
        b.ball = Pos::new(13, 5);
        let out = resolve_turn(&b, &[mv(5, MoveType::Shot, (13, 5), (16, 5))], &[mv(0, MoveType::Tackle, (15, 5), (15, 5))], &mut no_rolls());
        assert_eq!(out.goal, None);
        assert_eq!(out.board.ball, Pos::new(15, 5));
        assert_eq!(out.board.ball_owner, Some(Side::Team2));
    }

    #[test]
    fn tackles_in_place_still_produce_a_frame() {
        let b = new_game_board();
        let out = resolve_turn(&b, &[mv(0, MoveType::Tackle, (1, 5), (1, 5))], &[mv(0, MoveType::Tackle, (15, 5), (15, 5))], &mut no_rolls());
        assert_eq!(out.frames.len(), 1);
        assert_eq!(out.board, b);
    }

    #[test]
    fn available_cells_match_v1_shape() {
        let b = new_game_board();
        let cells = available_cells(&b, Side::Team1, 0, MoveType::Run);
        // Keeper at (1,5): cannot go to x=0; up/down/right/diagonals right.
        assert!(cells.contains(&Pos::new(1, 3)));
        assert!(cells.contains(&Pos::new(3, 5)));
        assert!(!cells.iter().any(|c| c.x == 0));
        let tackle = available_cells(&b, Side::Team1, 0, MoveType::Tackle);
        assert!(tackle.contains(&Pos::new(1, 5)));
    }
}
