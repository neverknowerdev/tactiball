//! Move planning for the player's own team: which moves a player may pick and
//! which cells they reach, given the moves already planned this turn.
//!
//! The browser runs this through the WASM build (`crates/engine-wasm`), and
//! every plan it offers passes `validate_moves`, which the canister runs on
//! commit. Keeping both here means the UI and the canister cannot disagree.

use crate::engine::*;
use crate::engine::path_to;

/// Move types a player may choose: the ball holder can run, pass or shoot,
/// everyone else can run or tackle.
pub fn modes_for(board: &Board, side: Side, player_id: u8) -> Vec<MoveType> {
    if ball_holder(board) == Some((side, player_id)) && board.ball_owner == Some(side) {
        vec![MoveType::Run, MoveType::Pass, MoveType::Shot]
    } else {
        vec![MoveType::Run, MoveType::Tackle]
    }
}

/// Cells `player_id` may target with `move_type`, given the team's other
/// planned moves. A run or tackle may not end on a teammate who stays, or on
/// another teammate's planned destination; a pass or shot ignores players.
/// A player who already has a planned move is re-planned (their old move is
/// ignored), and only one pass or shot is allowed per turn.
pub fn available_cells_planned(board: &Board, side: Side, player_id: u8, move_type: MoveType, planned: &[Move]) -> Vec<Pos> {
    let team = team_of(board, side);
    let Some(&current) = team.get(player_id as usize) else {
        return Vec::new();
    };
    if !modes_for(board, side, player_id).contains(&move_type) {
        return Vec::new();
    }
    let others: Vec<&Move> = planned.iter().filter(|m| m.player_id != player_id).collect();
    if move_type.moves_ball() && others.iter().any(|m| m.move_type.moves_ball()) {
        return Vec::new();
    }

    let mut blocked: Vec<Pos> = Vec::new();
    if !move_type.moves_ball() {
        for (i, p) in team.iter().enumerate() {
            let leaving = others.iter().any(|m| m.player_id as usize == i && !m.move_type.moves_ball() && m.to != m.from);
            if i != player_id as usize && !leaving {
                blocked.push(*p);
            }
        }
        blocked.extend(others.iter().filter(|m| !m.move_type.moves_ball()).map(|m| m.to));
    }

    let d = move_type.distance();
    let dirs = [(0, -d), (d, 0), (0, d), (-d, 0), (-d, -d), (d, -d), (-d, d), (d, d)];
    let mut cells = Vec::new();
    for (dx, dy) in dirs {
        for cell in path_to(current, current.x as i32 + dx, current.y as i32 + dy, move_type) {
            if !blocked.contains(&cell) && !cells.contains(&cell) {
                cells.push(cell);
            }
        }
    }
    if move_type == MoveType::Tackle && !blocked.contains(&current) {
        cells.push(current);
    }
    cells
}

/// Adds or replaces `player_id`'s move in `planned` and returns the new plan,
/// or an error if the target is not one of `available_cells_planned`.
pub fn plan_move(board: &Board, side: Side, planned: &[Move], player_id: u8, move_type: MoveType, to: Pos) -> Result<Vec<Move>, String> {
    if !available_cells_planned(board, side, player_id, move_type, planned).contains(&to) {
        return Err("this cell is not reachable".into());
    }
    let from = team_of(board, side)[player_id as usize];
    let mut next: Vec<Move> = planned.iter().filter(|m| m.player_id != player_id).copied().collect();
    next.push(Move { player_id, move_type, from, to });
    Ok(next)
}

/// The board as the planning player sees it: their runners moved and the ball
/// passed. The opponent's plan is secret, so it is not shown.
pub fn preview_board(board: &Board, side: Side, planned: &[Move]) -> Board {
    let mut next = board.clone();
    let holder = ball_holder(board);
    let passes = planned.iter().any(|m| m.move_type.moves_ball());
    for m in planned {
        if m.move_type.moves_ball() {
            next.ball = m.to;
            continue;
        }
        let players = match side {
            Side::Team1 => &mut next.team1,
            Side::Team2 => &mut next.team2,
        };
        if let Some(p) = players.get_mut(m.player_id as usize) {
            *p = m.to;
        }
        if holder == Some((side, m.player_id)) && !passes {
            next.ball = m.to;
        }
    }
    next
}

#[cfg(test)]
mod tests {
    use super::*;

    fn every_single_move(board: &Board, side: Side, planned: &[Move]) -> Vec<Move> {
        let mut out = Vec::new();
        for id in 0..PLAYERS_PER_TEAM as u8 {
            if planned.iter().any(|m| m.player_id == id) {
                continue;
            }
            for t in modes_for(board, side, id) {
                for to in available_cells_planned(board, side, id, t, planned) {
                    out.push(Move { player_id: id, move_type: t, from: team_of(board, side)[id as usize], to });
                }
            }
        }
        out
    }

    #[test]
    fn holder_can_pass_and_shoot_others_cannot() {
        let b = new_game_board();
        assert_eq!(modes_for(&b, Side::Team1, 5), vec![MoveType::Run, MoveType::Pass, MoveType::Shot]);
        assert_eq!(modes_for(&b, Side::Team1, 0), vec![MoveType::Run, MoveType::Tackle]);
        assert_eq!(modes_for(&b, Side::Team2, 5), vec![MoveType::Run, MoveType::Tackle]);
        assert!(available_cells_planned(&b, Side::Team1, 0, MoveType::Pass, &[]).is_empty());
    }

    #[test]
    fn every_offered_plan_passes_validation() {
        // Greedily build plans move by move from both kick-off boards and check
        // the canister would accept each intermediate plan.
        for board in [start_positions(Side::Team1), start_positions(Side::Team2)] {
            for side in [Side::Team1, Side::Team2] {
                for first in every_single_move(&board, side, &[]) {
                    let mut plan = vec![first];
                    validate_moves(&board, side, &plan).unwrap_or_else(|e| panic!("{first:?}: {e}"));
                    // Add one more move per remaining player, taking the first option.
                    for id in 0..PLAYERS_PER_TEAM as u8 {
                        if plan.iter().any(|m| m.player_id == id) {
                            continue;
                        }
                        let t = modes_for(&board, side, id)[0];
                        if let Some(&to) = available_cells_planned(&board, side, id, t, &plan).first() {
                            plan = plan_move(&board, side, &plan, id, t, to).unwrap();
                            validate_moves(&board, side, &plan).unwrap_or_else(|e| panic!("{plan:?}: {e}"));
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn runners_cannot_share_a_cell_and_one_pass_per_turn() {
        let b = new_game_board();
        // Player 3 at (6,3) plans a run to (7,4); the forward at (8,5) may no longer end there.
        assert!(available_cells_planned(&b, Side::Team1, 5, MoveType::Run, &[]).contains(&Pos::new(7, 4)));
        let plan = plan_move(&b, Side::Team1, &[], 3, MoveType::Run, Pos::new(7, 4)).unwrap();
        assert!(!available_cells_planned(&b, Side::Team1, 5, MoveType::Run, &plan).contains(&Pos::new(7, 4)));
        // Once player 3 leaves (6,3), a teammate may run into it.
        assert!(!available_cells_planned(&b, Side::Team1, 5, MoveType::Run, &[]).contains(&Pos::new(6, 3)));
        assert!(available_cells_planned(&b, Side::Team1, 5, MoveType::Run, &plan).contains(&Pos::new(6, 3)));

        let passed = plan_move(&b, Side::Team1, &[], 5, MoveType::Pass, Pos::new(5, 5)).unwrap();
        assert_eq!(preview_board(&b, Side::Team1, &passed).ball, Pos::new(5, 5));
        assert!(plan_move(&b, Side::Team1, &passed, 5, MoveType::Shot, Pos::new(12, 5)).is_ok(), "re-planning the holder replaces the pass");
    }

    #[test]
    fn preview_moves_ball_with_runner() {
        let b = new_game_board();
        let plan = plan_move(&b, Side::Team1, &[], 5, MoveType::Run, Pos::new(9, 5)).unwrap();
        let p = preview_board(&b, Side::Team1, &plan);
        assert_eq!(p.team1[5], Pos::new(9, 5));
        assert_eq!(p.ball, Pos::new(9, 5));
        assert_eq!(p.team2, b.team2);
    }
}
