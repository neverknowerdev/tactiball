//! Global counters for the home screen.

use crate::state::Store;
use crate::types::*;

pub fn global(s: &Store) -> GlobalStats {
    let mut by_chain: Vec<(String, u64)> = Vec::new();
    for t in s.teams.values() {
        let chain = s.user(t.0.owner).map(|u| u.home_chain).unwrap_or_default();
        match by_chain.iter_mut().find(|(c, _)| *c == chain) {
            Some((_, n)) => *n += 1,
            None => by_chain.push((chain, 1)),
        }
    }
    let games = s.games.len();
    let active = s.active_games.len();
    GlobalStats {
        users: s.users.len(),
        teams: s.teams.len(),
        games,
        active_games: active,
        finished_games: games - active,
        goals: s.meta().total_goals,
        teams_by_chain: by_chain,
    }
}
