//! The TactiBall engine for the browser.
//!
//! Values cross the boundary as plain JS objects with the same shape as the
//! canister's Candid types in the generated TS bindings: `Board`, `Move` and
//! `Pos` records, and `Side` / `MoveType` / `FrameKind` as strings such as
//! `"Team1"` or `"Run"`. A missing `ball_owner` is `undefined`.

use serde::Serialize;
use tactiball_engine::{self as engine, Board, Move, MoveType, Pos, Side};
use wasm_bindgen::prelude::*;

fn from_js<T: serde::de::DeserializeOwned>(v: JsValue, what: &str) -> Result<T, JsError> {
    serde_wasm_bindgen::from_value(v).map_err(|e| JsError::new(&format!("invalid {what}: {e}")))
}

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsError> {
    v.serialize(&serde_wasm_bindgen::Serializer::new()).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen(js_name = fieldWidth)]
pub fn field_width() -> i32 {
    engine::FIELD_WIDTH
}

#[wasm_bindgen(js_name = fieldHeight)]
pub fn field_height() -> i32 {
    engine::FIELD_HEIGHT
}

/// The kick-off board of a new game.
#[wasm_bindgen(js_name = newGameBoard)]
pub fn new_game_board() -> Result<JsValue, JsError> {
    to_js(&engine::new_game_board())
}

#[wasm_bindgen(js_name = isInGates)]
pub fn is_in_gates(x: i32, y: i32) -> bool {
    engine::is_in_gates(x, y)
}

/// `{ side, id }` of the player standing on the ball, or `undefined`.
#[wasm_bindgen(js_name = ballHolder)]
pub fn ball_holder(board: JsValue) -> Result<JsValue, JsError> {
    #[derive(Serialize)]
    struct Holder {
        side: Side,
        id: u8,
    }
    let board: Board = from_js(board, "board")?;
    to_js(&engine::ball_holder(&board).map(|(side, id)| Holder { side, id }))
}

/// Move types the player may choose, e.g. `["Run", "Pass", "Shot"]`.
#[wasm_bindgen(js_name = modesFor)]
pub fn modes_for(board: JsValue, side: JsValue, player_id: u8) -> Result<JsValue, JsError> {
    let board: Board = from_js(board, "board")?;
    let side: Side = from_js(side, "side")?;
    to_js(&engine::modes_for(&board, side, player_id))
}

/// Cells the player can reach with `move_type`, given the team's planned moves.
#[wasm_bindgen(js_name = availableCells)]
pub fn available_cells(board: JsValue, side: JsValue, player_id: u8, move_type: JsValue, planned: JsValue) -> Result<JsValue, JsError> {
    let board: Board = from_js(board, "board")?;
    let side: Side = from_js(side, "side")?;
    let move_type: MoveType = from_js(move_type, "move type")?;
    let planned: Vec<Move> = from_js(planned, "planned moves")?;
    to_js(&engine::available_cells_planned(&board, side, player_id, move_type, &planned))
}

/// Adds or replaces a player's move; throws if the target is not reachable.
#[wasm_bindgen(js_name = planMove)]
pub fn plan_move(board: JsValue, side: JsValue, planned: JsValue, player_id: u8, move_type: JsValue, to: JsValue) -> Result<JsValue, JsError> {
    let board: Board = from_js(board, "board")?;
    let side: Side = from_js(side, "side")?;
    let planned: Vec<Move> = from_js(planned, "planned moves")?;
    let move_type: MoveType = from_js(move_type, "move type")?;
    let to: Pos = from_js(to, "position")?;
    let next = engine::plan_move(&board, side, &planned, player_id, move_type, to).map_err(|e| JsError::new(&e))?;
    to_js(&next)
}

/// The board with the team's planned moves applied, for display.
#[wasm_bindgen(js_name = previewBoard)]
pub fn preview_board(board: JsValue, side: JsValue, planned: JsValue) -> Result<JsValue, JsError> {
    let board: Board = from_js(board, "board")?;
    let side: Side = from_js(side, "side")?;
    let planned: Vec<Move> = from_js(planned, "planned moves")?;
    to_js(&engine::preview_board(&board, side, &planned))
}

/// The canister's own check: `undefined` if the moves are valid, else the reason.
#[wasm_bindgen(js_name = validateMoves)]
pub fn validate_moves(board: JsValue, side: JsValue, moves: JsValue) -> Result<Option<String>, JsError> {
    let board: Board = from_js(board, "board")?;
    let side: Side = from_js(side, "side")?;
    let moves: Vec<Move> = from_js(moves, "moves")?;
    Ok(engine::validate_moves(&board, side, &moves).err().map(|e| e.to_string()))
}

/// ELO change for a finished game, as `[newRating1, newRating2]`.
#[wasm_bindgen(js_name = newRatings)]
pub fn new_ratings(rating1: u64, rating2: u64, score1: u8, score2: u8) -> Vec<u64> {
    let (a, b) = engine::rating::new_ratings(rating1, rating2, score1, score2);
    vec![a, b]
}
