//! TactiBall game engine and ELO rating.
//!
//! Pure Rust with no Internet Computer dependencies, so the same crate can be
//! used by the backend canister, native tests and the browser WASM build in `crates/engine-wasm`.
//!
//! The rules are a port of `frontend/lib/game.ts` (v1) and the ELO maths is a
//! port of `contracts/vendor/Elo.sol` + `ChessBallGame._updateEloRatings`.

pub mod engine;
pub mod planning;
pub mod rating;

pub use engine::*;
pub use planning::*;
