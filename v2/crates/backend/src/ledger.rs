//! Home-chain ledger, stubbed for the PoC.
//!
//! Every finished game is queued once per distinct home chain of its players
//! (a cross-chain game lands on both chains). Nothing is sent yet: the chain
//! writer (threshold ECDSA + EVM RPC canister, batched per the sync policy in
//! the plan) will drain this outbox in a later phase.

use crate::state::{Stored, Store};
use crate::types::*;

pub fn enqueue_game(s: &mut Store, game: &Game, now: Timestamp) {
    let mut chains = vec![game.team1.home_chain.clone()];
    if game.team2.home_chain != game.team1.home_chain {
        chains.push(game.team2.home_chain.clone());
    }
    for chain in chains.into_iter().filter(|c| !c.is_empty()) {
        let id = s.update_meta(|m| {
            let id = m.next_sync_id;
            m.next_sync_id += 1;
            id
        });
        s.sync.insert(id, Stored(SyncEntry { game_id: game.id, chain, state: SyncState::Pending, queued_at: now }));
    }
}

pub fn overview(s: &Store) -> Vec<ChainSyncOverview> {
    let mut out: Vec<ChainSyncOverview> = Vec::new();
    for e in s.sync.values().map(|e| e.0) {
        let idx = match out.iter().position(|o| o.chain == e.chain) {
            Some(i) => i,
            None => {
                out.push(ChainSyncOverview { chain: e.chain.clone(), pending: 0, in_flight: 0, synced: 0, failed: 0, oldest_pending_at: None });
                out.len() - 1
            }
        };
        let o = &mut out[idx];
        match e.state {
            SyncState::Pending => {
                o.pending += 1;
                o.oldest_pending_at = Some(o.oldest_pending_at.map_or(e.queued_at, |t| t.min(e.queued_at)));
            }
            SyncState::InFlight { .. } => o.in_flight += 1,
            SyncState::Synced { .. } => o.synced += 1,
            SyncState::Failed { .. } => o.failed += 1,
        }
    }
    out
}

pub fn game_status(s: &Store, game_id: GameId) -> Vec<SyncEntry> {
    s.sync.values().map(|e| e.0).filter(|e| e.game_id == game_id).collect()
}
