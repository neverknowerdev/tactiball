//! Stable-memory storage. Every map lives in its own virtual memory, so state
//! survives upgrades without pre/post-upgrade serialization.

use crate::types::*;
use candid::{CandidType, Principal};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::storable::Bound;
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, StableCell, Storable};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::cell::RefCell;

type Mem = VirtualMemory<DefaultMemoryImpl>;

/// Candid-encoded value wrapper for stable maps.
#[derive(Clone, Debug)]
pub struct Stored<T>(pub T);

impl<T: CandidType + for<'de> Deserialize<'de>> Storable for Stored<T> {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(candid::encode_one(&self.0).expect("candid encode"))
    }
    fn into_bytes(self) -> Vec<u8> {
        candid::encode_one(&self.0).expect("candid encode")
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        Stored(candid::decode_one(&bytes).expect("candid decode"))
    }
    const BOUND: Bound = Bound::Unbounded;
}

/// Counters and small singletons, kept in one stable cell.
#[derive(CandidType, Serialize, Deserialize, Clone, Debug, Default)]
pub struct Meta {
    pub next_user_id: u64,
    pub next_team_id: u64,
    pub next_game_id: u64,
    pub next_request_id: u64,
    pub next_event_seq: u64,
    pub next_sync_id: u64,
    pub nonce_counter: u64,
    /// Private entropy pool, refreshed from `raw_rand`.
    #[serde(with = "serde_bytes")]
    pub entropy: Vec<u8>,
    pub total_goals: u64,
}

const SETTINGS: MemoryId = MemoryId::new(0);
const META: MemoryId = MemoryId::new(1);
const USERS: MemoryId = MemoryId::new(2);
const IDENTITIES: MemoryId = MemoryId::new(3);
const SESSIONS: MemoryId = MemoryId::new(4);
const PENDING_AUTH: MemoryId = MemoryId::new(5);
const TEAMS: MemoryId = MemoryId::new(6);
const TEAM_NAMES: MemoryId = MemoryId::new(7);
const REQUESTS: MemoryId = MemoryId::new(8);
const GAMES: MemoryId = MemoryId::new(9);
const TURNS: MemoryId = MemoryId::new(10);
const ACTIVE_GAMES: MemoryId = MemoryId::new(11);
const QUEUE: MemoryId = MemoryId::new(12);
const EVENTS: MemoryId = MemoryId::new(13);
const SYNC: MemoryId = MemoryId::new(14);
const NULLIFIERS: MemoryId = MemoryId::new(15);
const TEAM_GAMES: MemoryId = MemoryId::new(16);
const EMAILS: MemoryId = MemoryId::new(17);

pub struct Store {
    pub settings: StableCell<Stored<Settings>, Mem>,
    pub meta: StableCell<Stored<Meta>, Mem>,
    pub users: StableBTreeMap<u64, Stored<User>, Mem>,
    /// identity key ("eip155:0x…" or "email:…") -> user id
    pub identities: StableBTreeMap<String, u64, Mem>,
    /// session principal -> session
    pub sessions: StableBTreeMap<Principal, Stored<Session>, Mem>,
    pub pending_auth: StableBTreeMap<Principal, Stored<PendingAuth>, Mem>,
    pub teams: StableBTreeMap<u64, Stored<Team>, Mem>,
    /// lower-cased name -> team id
    pub team_names: StableBTreeMap<String, u64, Mem>,
    pub requests: StableBTreeMap<u64, Stored<GameRequest>, Mem>,
    pub games: StableBTreeMap<u64, Stored<Game>, Mem>,
    /// (game id, turn) -> turn record
    pub turns: StableBTreeMap<(u64, u32), Stored<TurnRecord>, Mem>,
    pub active_games: StableBTreeMap<u64, (), Mem>,
    /// team id -> time it joined the quick-match queue
    pub queue: StableBTreeMap<u64, u64, Mem>,
    pub events: StableBTreeMap<u64, Stored<Event>, Mem>,
    pub sync: StableBTreeMap<u64, Stored<SyncEntry>, Mem>,
    /// World ID nullifier -> user id (empty until verification ships)
    pub nullifiers: StableBTreeMap<String, u64, Mem>,
    /// (team id, game id) index for a team's game list
    pub team_games: StableBTreeMap<(u64, u64), (), Mem>,
    /// lower-cased email -> password hash and lockout state
    pub emails: StableBTreeMap<String, Stored<EmailCredential>, Mem>,
}

thread_local! {
    static MEMORY: MemoryManager<DefaultMemoryImpl> = MemoryManager::init(DefaultMemoryImpl::default());
    static STORE: RefCell<Store> = RefCell::new(Store::load());
}

fn mem(id: MemoryId) -> Mem {
    MEMORY.with(|m| m.get(id))
}

impl Store {
    fn load() -> Self {
        Store {
            settings: StableCell::init(mem(SETTINGS), Stored(Settings::default())),
            meta: StableCell::init(mem(META), Stored(Meta { next_user_id: 1, next_team_id: 1, next_game_id: 1, next_request_id: 1, next_event_seq: 1, next_sync_id: 1, ..Default::default() })),
            users: StableBTreeMap::init(mem(USERS)),
            identities: StableBTreeMap::init(mem(IDENTITIES)),
            sessions: StableBTreeMap::init(mem(SESSIONS)),
            pending_auth: StableBTreeMap::init(mem(PENDING_AUTH)),
            teams: StableBTreeMap::init(mem(TEAMS)),
            team_names: StableBTreeMap::init(mem(TEAM_NAMES)),
            requests: StableBTreeMap::init(mem(REQUESTS)),
            games: StableBTreeMap::init(mem(GAMES)),
            turns: StableBTreeMap::init(mem(TURNS)),
            active_games: StableBTreeMap::init(mem(ACTIVE_GAMES)),
            queue: StableBTreeMap::init(mem(QUEUE)),
            events: StableBTreeMap::init(mem(EVENTS)),
            sync: StableBTreeMap::init(mem(SYNC)),
            nullifiers: StableBTreeMap::init(mem(NULLIFIERS)),
            team_games: StableBTreeMap::init(mem(TEAM_GAMES)),
            emails: StableBTreeMap::init(mem(EMAILS)),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.get().0.clone()
    }

    pub fn meta(&self) -> Meta {
        self.meta.get().0.clone()
    }

    pub fn update_meta<R>(&mut self, f: impl FnOnce(&mut Meta) -> R) -> R {
        let mut m = self.meta();
        let r = f(&mut m);
        self.meta.set(Stored(m));
        r
    }

    pub fn user(&self, id: UserId) -> Option<User> {
        self.users.get(&id).map(|u| u.0)
    }

    pub fn put_user(&mut self, u: User) {
        self.users.insert(u.id, Stored(u));
    }

    pub fn team(&self, id: TeamId) -> Option<Team> {
        self.teams.get(&id).map(|t| t.0)
    }

    pub fn put_team(&mut self, t: Team) {
        self.teams.insert(t.id, Stored(t));
    }

    pub fn game(&self, id: GameId) -> Option<Game> {
        self.games.get(&id).map(|g| g.0)
    }

    pub fn put_game(&mut self, g: Game) {
        self.games.insert(g.id, Stored(g));
    }

    pub fn request(&self, id: RequestId) -> Option<GameRequest> {
        self.requests.get(&id).map(|r| r.0)
    }

    pub fn emit(&mut self, at: Timestamp, kind: EventKind) {
        let seq = self.update_meta(|m| {
            let s = m.next_event_seq;
            m.next_event_seq += 1;
            s
        });
        self.events.insert(seq, Stored(Event { seq, at, kind }));
    }
}

pub fn with<R>(f: impl FnOnce(&Store) -> R) -> R {
    STORE.with(|s| f(&s.borrow()))
}

pub fn with_mut<R>(f: impl FnOnce(&mut Store) -> R) -> R {
    STORE.with(|s| f(&mut s.borrow_mut()))
}
