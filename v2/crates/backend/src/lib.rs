//! TactiBall v2 backend canister.
//!
//! One canister owns users, wallet sign-in, teams, the lobby, games, the
//! engine, randomness, timeouts, ELO, the event log and (stubbed) the
//! home-chain ledger outbox. This file only wires the public API to the
//! modules; each module keeps its logic free of IC calls so it can be tested
//! natively.

pub mod auth;
pub mod eth;
pub mod games;
pub mod ledger;
pub mod lobby;
pub mod state;
pub mod stats;
pub mod teams;
pub mod types;

#[cfg(test)]
mod tests;

use candid::Principal;
use ic_cdk::api::{canister_cycle_balance, msg_caller, time};
use ic_cdk::{init, inspect_message, post_upgrade, query, update};
use std::cell::Cell;
use std::time::Duration;
use tactiball_engine::Move;
use types::*;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
const TICK_SECS: u64 = 5;
/// Refresh the entropy pool every 12 ticks (one minute).
const ENTROPY_EVERY: u64 = 12;

thread_local! {
    static TICKS: Cell<u64> = const { Cell::new(0) };
}

// ---------------------------------------------------------------- lifecycle

fn apply_init(args: Option<InitArgs>) {
    if let Some(update) = args.and_then(|a| a.settings) {
        state::with_mut(|s| apply_settings(s, update)).unwrap_or_else(|e| ic_cdk::trap(e));
    }
    start_timers();
}

#[init]
fn init(args: Option<InitArgs>) {
    apply_init(args);
}

#[post_upgrade]
fn post_upgrade(args: Option<InitArgs>) {
    // Stable structures need no migration; timers must be re-armed.
    apply_init(args);
}

fn start_timers() {
    ic_cdk_timers::set_timer(Duration::ZERO, refresh_entropy());
    ic_cdk_timers::set_timer_interval(Duration::from_secs(TICK_SECS), || async {
        let now = time();
        state::with_mut(|s| {
            games::check_timeouts(s, now);
            lobby::expire(s, now);
        });
        let tick = TICKS.with(|t| {
            t.set(t.get() + 1);
            t.get()
        });
        if tick.is_multiple_of(ENTROPY_EVERY) {
            state::with_mut(|s| auth::cleanup(s, now));
            refresh_entropy().await;
        }
    });
}

/// Mixes fresh `raw_rand` bytes into the private entropy pool.
async fn refresh_entropy() {
    let res = ic_cdk::call::Call::bounded_wait(Principal::management_canister(), "raw_rand").await;
    if let Some(bytes) = res.ok().and_then(|r| r.candid::<Vec<u8>>().ok()) {
        use sha2::{Digest, Sha256};
        state::with_mut(|s| {
            s.update_meta(|m| {
                let mut h = Sha256::new();
                h.update(&m.entropy);
                h.update(&bytes);
                m.entropy = h.finalize().to_vec();
            })
        });
    }
}

/// Drops ingress calls that would only waste cycles: anonymous callers, and
/// game methods from callers without a session.
#[inspect_message]
fn inspect() {
    let caller = msg_caller();
    let method = ic_cdk::api::msg_method_name();
    if caller == Principal::anonymous() {
        return;
    }
    let needs_session = !matches!(method.as_str(), "auth_prepare" | "auth_login" | "sign_out") && !method.starts_with("admin_");
    if needs_session && state::with(|s| auth::session_user(s, &caller, time()).is_none()) {
        return;
    }
    ic_cdk::api::accept_message();
}

fn is_admin(s: &state::Store, p: &Principal) -> bool {
    ic_cdk::api::is_controller(p) || s.settings().admins.contains(p)
}

fn apply_settings(s: &mut state::Store, u: SettingsUpdate) -> Res<Settings> {
    let mut v = s.settings();
    macro_rules! set {
        ($($f:ident),*) => { $( if let Some(x) = u.$f { v.$f = x; } )* };
    }
    set!(default_session_ttl_secs, min_session_ttl_secs, max_session_ttl_secs, sign_in_ttl_secs, allowed_domains, chains, move_timeout_secs, max_turns, request_ttl_secs, game_modes, admins);
    if v.min_session_ttl_secs > v.default_session_ttl_secs || v.default_session_ttl_secs > v.max_session_ttl_secs {
        return Err("session lengths must satisfy min <= default <= max".into());
    }
    if v.move_timeout_secs < 10 || !(1..=200).contains(&v.max_turns) || v.sign_in_ttl_secs < 60 || v.request_ttl_secs < 30 {
        return Err("setting out of range".into());
    }
    v.allowed_domains = v.allowed_domains.iter().map(|d| d.trim().to_ascii_lowercase()).collect();
    s.settings.set(state::Stored(v.clone()));
    Ok(v)
}

// ---------------------------------------------------------------- admin & health

#[query]
fn health() -> Health {
    state::with(|s| Health {
        version: VERSION.to_string(),
        time: time(),
        cycles: canister_cycle_balance(),
        entropy_ready: !s.meta().entropy.is_empty(),
        users: s.users.len(),
        active_games: s.active_games.len(),
    })
}

#[query]
fn get_settings() -> Settings {
    state::with(|s| s.settings())
}

#[update]
fn admin_update_settings(update: SettingsUpdate) -> Res<Settings> {
    let caller = msg_caller();
    let now = time();
    state::with_mut(|s| {
        if !is_admin(s, &caller) {
            return Err("admins only".into());
        }
        let v = apply_settings(s, update)?;
        s.emit(now, EventKind::SettingsChanged { by: caller });
        Ok(v)
    })
}

// ---------------------------------------------------------------- auth

#[update]
fn auth_prepare(req: PrepareSignIn) -> Res<SignInMessage> {
    state::with_mut(|s| auth::prepare(s, msg_caller(), time(), req, AuthPurpose::Login))
}

#[update]
fn auth_login(signature: String) -> Res<SessionInfo> {
    state::with_mut(|s| auth::login(s, msg_caller(), time(), &signature))
}

#[update]
fn auth_prepare_link(req: PrepareSignIn) -> Res<SignInMessage> {
    state::with_mut(|s| auth::prepare(s, msg_caller(), time(), req, AuthPurpose::LinkWallet))
}

#[update]
fn auth_link(signature: String) -> Res<User> {
    state::with_mut(|s| auth::link_wallet(s, msg_caller(), time(), &signature))
}

#[update]
fn sign_out() {
    state::with_mut(|s| auth::sign_out(s, msg_caller()))
}

#[query]
fn whoami() -> Option<SessionInfo> {
    state::with(|s| {
        let (session, user) = auth::session_user(s, &msg_caller(), time())?;
        let team = user.team_id.and_then(|t| teams::team_view(s, t));
        Some(SessionInfo { user, team, session_expires_at: session.expires_at, new_user: false })
    })
}

#[update]
fn set_session_length(secs: Option<u64>) -> Res<User> {
    state::with_mut(|s| auth::set_session_ttl(s, msg_caller(), time(), secs))
}

#[update]
fn set_home_chain(chain_id: u64) -> Res<User> {
    state::with_mut(|s| auth::set_home_chain(s, msg_caller(), time(), chain_id))
}

// ---------------------------------------------------------------- teams

#[update]
fn create_team(name: String, country: u16) -> Res<TeamView> {
    state::with_mut(|s| teams::create_team(s, msg_caller(), time(), name, country))
}

#[query]
fn get_team(team_id: TeamId) -> Option<TeamView> {
    state::with(|s| teams::team_view(s, team_id))
}

/// The team of whoever signed in with this wallet, so the app can show it
/// before the player signs a message. `Err` if the address is malformed.
#[query]
fn team_by_wallet(address: String) -> Res<Option<TeamView>> {
    state::with(|s| teams::by_wallet(s, &address))
}

#[query]
fn leaderboard(offset: u64, limit: u64) -> Vec<TeamView> {
    state::with(|s| teams::leaderboard(s, offset, limit))
}

#[query]
fn search_teams(query: String, limit: u64) -> Vec<TeamView> {
    state::with(|s| teams::search(s, &query, limit))
}

// ---------------------------------------------------------------- lobby

#[query]
fn lobby() -> Res<Lobby> {
    state::with(|s| lobby::lobby(s, msg_caller(), time()))
}

#[update]
fn create_game_request(to_team: TeamId) -> Res<GameRequestView> {
    state::with_mut(|s| lobby::create_request(s, msg_caller(), time(), to_team))
}

#[update]
fn cancel_game_request(request_id: RequestId) -> Res<()> {
    state::with_mut(|s| lobby::cancel_request(s, msg_caller(), time(), request_id))
}

#[update]
fn accept_game_request(request_id: RequestId) -> Res<GameId> {
    state::with_mut(|s| lobby::accept_request(s, msg_caller(), time(), request_id))
}

#[update]
fn join_queue() -> Res<Option<GameId>> {
    state::with_mut(|s| lobby::join_queue(s, msg_caller(), time()))
}

#[update]
fn leave_queue() -> Res<()> {
    state::with_mut(|s| lobby::leave_queue(s, msg_caller(), time()))
}

// ---------------------------------------------------------------- games

#[update]
fn commit_moves(game_id: GameId, turn: u32, moves: Vec<Move>) -> Res<CommitResult> {
    state::with_mut(|s| games::commit_moves(s, msg_caller(), time(), game_id, turn, moves))
}

#[update]
fn surrender(game_id: GameId) -> Res<GameView> {
    state::with_mut(|s| games::surrender(s, msg_caller(), time(), game_id))
}

#[query]
fn get_game(game_id: GameId) -> Option<GameView> {
    state::with(|s| {
        let viewer = auth::session_user(s, &msg_caller(), time()).map(|(_, u)| u.id);
        s.game(game_id).map(|g| games::view(&g, viewer))
    })
}

#[query]
fn get_turns(game_id: GameId, from_turn: u32, limit: u32) -> Vec<TurnRecord> {
    state::with(|s| games::turns(s, game_id, from_turn, limit))
}

#[query]
fn team_games(team_id: TeamId, limit: u32) -> Vec<GameSummary> {
    state::with(|s| games::team_games(s, team_id, limit))
}

#[query]
fn recent_games(limit: u32) -> Vec<GameSummary> {
    state::with(|s| games::recent_games(s, limit))
}

// ---------------------------------------------------------------- stats, events, ledger

#[query]
fn global_stats() -> GlobalStats {
    state::with(stats::global)
}

#[query]
fn get_events(since_seq: u64, limit: u32) -> Vec<Event> {
    state::with(|s| s.events.range(since_seq..).take(limit.min(200) as usize).map(|e| e.value().0).collect())
}

#[query]
fn sync_overview() -> Vec<ChainSyncOverview> {
    state::with(ledger::overview)
}

#[query]
fn game_sync_status(game_id: GameId) -> Vec<SyncEntry> {
    state::with(|s| ledger::game_status(s, game_id))
}

ic_cdk::export_candid!();
