//! Candid types: stored records and the public API.

use candid::{CandidType, Principal};
use serde::{Deserialize, Serialize};
use tactiball_engine::{Board, Frame, Move, Side};

pub type UserId = u64;
pub type TeamId = u64;
pub type GameId = u64;
pub type RequestId = u64;
/// Nanoseconds since the Unix epoch (IC time).
pub type Timestamp = u64;

pub const SECOND: u64 = 1_000_000_000;
pub const DAY_SECS: u64 = 24 * 60 * 60;

// ---------------------------------------------------------------- settings

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ChainConfig {
    /// EIP-155 chain id, e.g. 8453 for Base.
    pub chain_id: u64,
    pub name: String,
    pub testnet: bool,
    pub enabled: bool,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameMode {
    /// Direct invite to a chosen team.
    Invite,
    /// Quick match: paired with whoever is waiting.
    Queue,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum VerificationLevel {
    Device,
    Orb,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum VerificationKind {
    WorldId,
}

/// Proof-of-human hook (World ID later). Nothing writes these yet.
#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Verification {
    pub kind: VerificationKind,
    pub level: VerificationLevel,
    pub nullifier: String,
    pub verified_at: Timestamp,
}

/// Per-mode switch: `None` means anyone may play this mode.
#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GameModePolicy {
    pub mode: GameMode,
    pub requires_verification: Option<VerificationLevel>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Settings {
    /// Session length when the user has not chosen one (3 days).
    pub default_session_ttl_secs: u64,
    pub min_session_ttl_secs: u64,
    pub max_session_ttl_secs: u64,
    /// How long a sign-in message stays valid before it must be signed.
    pub sign_in_ttl_secs: u64,
    /// Domains (host[:port]) the sign-in message may name. Empty = any, for local dev only.
    pub allowed_domains: Vec<String>,
    pub chains: Vec<ChainConfig>,
    /// Time each side has to commit a turn.
    pub move_timeout_secs: u64,
    pub max_turns: u32,
    pub request_ttl_secs: u64,
    pub game_modes: Vec<GameModePolicy>,
    /// Extra admins besides the canister controllers.
    pub admins: Vec<Principal>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            default_session_ttl_secs: 3 * DAY_SECS,
            min_session_ttl_secs: 60 * 60,
            max_session_ttl_secs: 30 * DAY_SECS,
            sign_in_ttl_secs: 10 * 60,
            allowed_domains: vec![],
            chains: default_chains(),
            move_timeout_secs: 60,
            max_turns: 45,
            request_ttl_secs: 10 * 60,
            game_modes: vec![
                GameModePolicy { mode: GameMode::Invite, requires_verification: None },
                GameModePolicy { mode: GameMode::Queue, requires_verification: None },
            ],
            admins: vec![],
        }
    }
}

pub fn default_chains() -> Vec<ChainConfig> {
    let c = |chain_id, name: &str, testnet| ChainConfig { chain_id, name: name.to_string(), testnet, enabled: true };
    vec![
        c(8453, "Base", false),
        c(84532, "Base Sepolia", true),
        c(4663, "Robinhood Chain", false),
        c(46630, "Robinhood Chain Testnet", true),
    ]
}

/// Partial update for `admin_update_settings`; `None` keeps the current value.
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
pub struct SettingsUpdate {
    pub default_session_ttl_secs: Option<u64>,
    pub min_session_ttl_secs: Option<u64>,
    pub max_session_ttl_secs: Option<u64>,
    pub sign_in_ttl_secs: Option<u64>,
    pub allowed_domains: Option<Vec<String>>,
    pub chains: Option<Vec<ChainConfig>>,
    pub move_timeout_secs: Option<u64>,
    pub max_turns: Option<u32>,
    pub request_ttl_secs: Option<u64>,
    pub game_modes: Option<Vec<GameModePolicy>>,
    pub admins: Option<Vec<Principal>>,
}

/// Init / upgrade argument. Everything is optional so `()` and `(null)` work.
#[derive(CandidType, Deserialize, Clone, Debug, Default)]
pub struct InitArgs {
    pub settings: Option<SettingsUpdate>,
}

// ---------------------------------------------------------------- users & auth

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct User {
    pub id: UserId,
    pub created_at: Timestamp,
    /// CAIP-2 id of the chain the user first signed in from, e.g. "eip155:8453".
    /// Shown as a badge next to the team name. Empty for an email account
    /// until it links a wallet.
    pub home_chain: String,
    /// Sign-in identities: wallets ("eip155:0xabc…", chain-agnostic EOAs) and
    /// at most one email ("email:name@example.com").
    pub identities: Vec<String>,
    pub team_id: Option<TeamId>,
    pub verifications: Vec<Verification>,
    /// The user's own session length; `None` uses the default.
    pub session_ttl_secs: Option<u64>,
    pub last_login_at: Timestamp,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Session {
    pub user_id: UserId,
    pub identity: String,
    pub chain_id: u64,
    pub created_at: Timestamp,
    pub expires_at: Timestamp,
}

/// Stored email login; see `crate::email`.
#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EmailCredential {
    pub user_id: UserId,
    #[serde(with = "serde_bytes")]
    pub salt: Vec<u8>,
    #[serde(with = "serde_bytes")]
    pub hash: Vec<u8>,
    pub iterations: u32,
    /// Wrong passwords in a row; the account locks at `email::MAX_FAILURES`.
    pub failed_attempts: u32,
    pub locked_until: Timestamp,
    pub created_at: Timestamp,
    pub password_changed_at: Timestamp,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct EmailCredentials {
    pub email: String,
    /// PBKDF2-HMAC-SHA256(password, "tactiball:" + lower-cased email,
    /// 210 000 rounds, 32 bytes), computed in the browser.
    #[serde(with = "serde_bytes")]
    pub password_key: Vec<u8>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthPurpose {
    Login,
    LinkWallet,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PendingAuth {
    pub purpose: AuthPurpose,
    /// Lower-case 0x address.
    pub address: String,
    pub chain_id: u64,
    pub message: String,
    pub expires_at: Timestamp,
    pub session_expires_at: Timestamp,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct PrepareSignIn {
    /// 0x-prefixed EVM address of the wallet.
    pub address: String,
    pub chain_id: u64,
    /// `window.location.host` of the frontend; must be an allowed domain.
    pub domain: String,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct SignInMessage {
    pub message: String,
    pub expires_at: Timestamp,
    pub session_expires_at: Timestamp,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct SessionInfo {
    pub user: User,
    pub team: Option<TeamView>,
    pub session_expires_at: Timestamp,
    pub new_user: bool,
}

// ---------------------------------------------------------------- teams & lobby

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Team {
    pub id: TeamId,
    pub owner: UserId,
    pub name: String,
    /// Country id from countryList.json, as in v1.
    pub country: u16,
    pub elo: u64,
    pub created_at: Timestamp,
    pub games: u64,
    pub wins: u64,
    pub draws: u64,
    pub losses: u64,
    pub goals_for: u64,
    pub goals_against: u64,
    pub active_game: Option<GameId>,
    pub outgoing_request: Option<RequestId>,
}

/// A team as other players see it, with the owner's chain badge.
#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct TeamView {
    pub id: TeamId,
    pub name: String,
    pub country: u16,
    pub elo: u64,
    pub home_chain: String,
    pub verified_human: bool,
    pub games: u64,
    pub wins: u64,
    pub draws: u64,
    pub losses: u64,
    pub goals_for: u64,
    pub goals_against: u64,
    pub active_game: Option<GameId>,
    pub created_at: Timestamp,
    /// Results of the last finished games, newest first (at most 5).
    pub form: Vec<Outcome>,
}

#[derive(CandidType, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Win,
    Draw,
    Loss,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GameRequest {
    pub id: RequestId,
    pub from_team: TeamId,
    pub to_team: TeamId,
    pub created_at: Timestamp,
    pub expires_at: Timestamp,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct GameRequestView {
    pub id: RequestId,
    pub from_team: TeamView,
    pub to_team: TeamView,
    pub created_at: Timestamp,
    pub expires_at: Timestamp,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct Lobby {
    pub incoming: Vec<GameRequestView>,
    pub outgoing: Vec<GameRequestView>,
    pub in_queue: bool,
    pub active_game: Option<GameId>,
}

// ---------------------------------------------------------------- games

#[derive(CandidType, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameStatus {
    Active,
    /// Played all turns.
    Finished,
    /// One side missed the turn deadline and the other claimed the win: 3:0
    /// (no ELO change, as in v1).
    FinishedByTimeout,
    /// No longer produced: games no longer end on time by themselves. Kept so
    /// stored games still decode.
    Abandoned,
    /// A player conceded; the opponent wins 3:0, no ELO change.
    Surrendered,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GameTeam {
    pub team_id: TeamId,
    pub user_id: UserId,
    pub name: String,
    pub country: u16,
    pub home_chain: String,
    pub elo_before: u64,
    pub elo_after: Option<u64>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Game {
    pub id: GameId,
    pub mode: GameMode,
    pub team1: GameTeam,
    pub team2: GameTeam,
    pub status: GameStatus,
    pub winner: Option<Side>,
    pub score1: u8,
    pub score2: u8,
    /// Turns resolved so far; the turn being played is `turns_played + 1`.
    pub turns_played: u32,
    pub max_turns: u32,
    pub board: Board,
    pub pending1: Option<Vec<Move>>,
    pub pending2: Option<Vec<Move>>,
    pub created_at: Timestamp,
    pub turn_started_at: Timestamp,
    pub move_timeout_secs: u64,
    pub finished_at: Option<Timestamp>,
    /// Bumped on every change; clients poll and refetch when it moves.
    pub version: u64,
    /// sha256 chain over every resolved turn, for the home-chain ledger.
    #[serde(with = "serde_bytes")]
    pub history_hash: Vec<u8>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TurnRecord {
    pub turn: u32,
    pub team1_moves: Vec<Move>,
    pub team2_moves: Vec<Move>,
    /// Randomness for this turn (derived from `raw_rand`); clash rolls come from it.
    #[serde(with = "serde_bytes")]
    pub seed: Vec<u8>,
    pub rolls: Vec<u8>,
    pub frames: Vec<Frame>,
    pub goal: Option<Side>,
    pub resolved_at: Timestamp,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct GameView {
    pub id: GameId,
    pub mode: GameMode,
    pub team1: GameTeam,
    pub team2: GameTeam,
    pub status: GameStatus,
    pub winner: Option<Side>,
    pub score1: u8,
    pub score2: u8,
    pub turns_played: u32,
    pub max_turns: u32,
    pub board: Board,
    pub committed1: bool,
    pub committed2: bool,
    /// The caller's side in this game, if they play in it.
    pub my_side: Option<Side>,
    /// The caller's own committed moves for the current turn.
    pub my_pending: Option<Vec<Move>>,
    pub created_at: Timestamp,
    pub turn_started_at: Timestamp,
    pub turn_deadline: Timestamp,
    pub finished_at: Option<Timestamp>,
    pub version: u64,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct CommitResult {
    /// True when this commit completed the turn and it was resolved.
    pub resolved: bool,
    pub game: GameView,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct GameSummary {
    pub id: GameId,
    pub team1: GameTeam,
    pub team2: GameTeam,
    pub status: GameStatus,
    pub winner: Option<Side>,
    pub score1: u8,
    pub score2: u8,
    pub created_at: Timestamp,
    pub finished_at: Option<Timestamp>,
}

// ---------------------------------------------------------------- events & stats

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum EventKind {
    UserCreated { user_id: UserId, identity: String, home_chain: String },
    WalletLinked { user_id: UserId, identity: String },
    EmailLinked { user_id: UserId },
    TeamCreated { team_id: TeamId, user_id: UserId, name: String },
    GameRequested { request_id: RequestId, from_team: TeamId, to_team: TeamId },
    GameRequestClosed { request_id: RequestId, reason: String },
    GameStarted { game_id: GameId, team1: TeamId, team2: TeamId },
    TurnResolved { game_id: GameId, turn: u32, score1: u8, score2: u8 },
    GameFinished { game_id: GameId, status: GameStatus, score1: u8, score2: u8, winner: Option<Side> },
    SettingsChanged { by: Principal },
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Event {
    pub seq: u64,
    pub at: Timestamp,
    pub kind: EventKind,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct GlobalStats {
    pub users: u64,
    pub teams: u64,
    pub games: u64,
    pub active_games: u64,
    pub finished_games: u64,
    pub goals: u64,
    pub teams_by_chain: Vec<(String, u64)>,
}

// ---------------------------------------------------------------- home-chain ledger (stub)

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum SyncState {
    Pending,
    InFlight { batch: u64 },
    Synced { batch: u64, tx_hash: String },
    Failed { attempts: u32, error: String },
}

/// One finished game waiting to be written to one home chain.
#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SyncEntry {
    pub game_id: GameId,
    pub chain: String,
    pub state: SyncState,
    pub queued_at: Timestamp,
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct ChainSyncOverview {
    pub chain: String,
    pub pending: u64,
    pub in_flight: u64,
    pub synced: u64,
    pub failed: u64,
    pub oldest_pending_at: Option<Timestamp>,
}

// ---------------------------------------------------------------- misc

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub struct Health {
    pub version: String,
    pub time: Timestamp,
    pub cycles: u128,
    pub entropy_ready: bool,
    pub users: u64,
    pub active_games: u64,
}

/// Every update method returns `Result<T, String>` with a readable error.
pub type Res<T> = Result<T, String>;
