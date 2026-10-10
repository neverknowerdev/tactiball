//! End-to-end tests of the canister logic, run natively (`cargo test`).
//! Each test runs on its own thread, so each gets a fresh stable memory.

use crate::types::*;
use crate::{auth, eth, games, ledger, lobby, state, teams};
use candid::Principal;
use k256::ecdsa::SigningKey;
use tactiball_engine::{Move, MoveType, Pos, Side};

const T0: u64 = 1_791_633_365 * SECOND;
const DOMAIN: &str = "tactiball.app";

struct Wallet {
    key: SigningKey,
    address: String,
    session: Principal,
}

impl Wallet {
    fn new(seed: u8) -> Self {
        let key = SigningKey::from_slice(&[seed; 32]).unwrap();
        let point = key.verifying_key().to_sec1_point(false);
        let hash = eth::keccak256(&point.as_bytes()[1..]);
        let address = format!("0x{}", hex::encode(&hash[12..]));
        Wallet { key, address, session: Principal::self_authenticating([seed, 1, 2, 3]) }
    }

    fn sign(&self, message: &str) -> String {
        let hash = eth::personal_message_hash(message);
        let (sig, rec) = self.key.sign_prehash_recoverable(&hash);
        let mut bytes = sig.to_bytes().to_vec();
        bytes.push(27 + rec.to_byte());
        format!("0x{}", hex::encode(bytes))
    }

    fn sign_in(&self, chain_id: u64, now: u64) -> SessionInfo {
        let msg = state::with_mut(|s| {
            auth::prepare(s, self.session, now, PrepareSignIn { address: self.address.clone(), chain_id, domain: DOMAIN.into() }, AuthPurpose::Login)
        })
        .unwrap();
        state::with_mut(|s| auth::login(s, self.session, now, &self.sign(&msg.message))).unwrap()
    }
}

fn keeper_stays(side: Side) -> Vec<Move> {
    let x = if side == Side::Team1 { 1 } else { 15 };
    vec![Move { player_id: 0, move_type: MoveType::Tackle, from: Pos::new(x, 5), to: Pos::new(x, 5) }]
}

fn setup_two_teams() -> (Wallet, Wallet, TeamId, TeamId) {
    let a = Wallet::new(7);
    let b = Wallet::new(9);
    a.sign_in(8453, T0);
    b.sign_in(4663, T0);
    let ta = state::with_mut(|s| teams::create_team(s, a.session, T0, "Red Lions".into(), 1)).unwrap();
    let tb = state::with_mut(|s| teams::create_team(s, b.session, T0, "Blue Hawks".into(), 2)).unwrap();
    (a, b, ta.id, tb.id)
}

#[test]
fn sign_in_message_is_siwe_and_binds_the_session() {
    let a = Wallet::new(7);
    let msg = state::with_mut(|s| {
        auth::prepare(s, a.session, T0, PrepareSignIn { address: a.address.to_uppercase().replace("0X", "0x"), chain_id: 8453, domain: DOMAIN.into() }, AuthPurpose::Login)
    })
    .unwrap();
    assert!(msg.message.starts_with("tactiball.app wants you to sign in with your Ethereum account:\n0x"));
    assert!(msg.message.contains(&eth::to_checksum(&a.address)));
    assert!(msg.message.contains("Chain ID: 8453\n"));
    assert!(msg.message.contains(&format!("- icp:session:{}", a.session.to_text())));
    assert!(msg.message.contains("Issued At: 2026-10-10T"));
    assert_eq!(msg.session_expires_at, T0 + 3 * DAY_SECS * SECOND);

    let info = state::with_mut(|s| auth::login(s, a.session, T0, &a.sign(&msg.message))).unwrap();
    assert!(info.new_user);
    assert_eq!(info.user.home_chain, "eip155:8453");
    assert_eq!(info.user.identities, vec![format!("eip155:{}", a.address)]);

    // The nonce is single-use.
    assert!(state::with_mut(|s| auth::login(s, a.session, T0, &a.sign(&msg.message))).is_err());
}

#[test]
fn sign_in_rejects_wrong_wallet_other_session_and_expiry() {
    let a = Wallet::new(7);
    let b = Wallet::new(9);
    let prep = |w: &Wallet| {
        state::with_mut(|s| auth::prepare(s, w.session, T0, PrepareSignIn { address: w.address.clone(), chain_id: 8453, domain: DOMAIN.into() }, AuthPurpose::Login)).unwrap()
    };
    let msg = prep(&a);
    // Signed by another wallet.
    assert!(state::with_mut(|s| auth::login(s, a.session, T0, &b.sign(&msg.message))).is_err());
    // A captured signature cannot be used from another session key.
    let msg = prep(&a);
    assert!(state::with_mut(|s| auth::login(s, b.session, T0, &a.sign(&msg.message))).is_err());
    // Too late.
    let msg = prep(&a);
    assert!(state::with_mut(|s| auth::login(s, a.session, T0 + 11 * 60 * SECOND, &a.sign(&msg.message))).is_err());
    // Unsupported chain and anonymous caller.
    assert!(state::with_mut(|s| auth::prepare(s, a.session, T0, PrepareSignIn { address: a.address.clone(), chain_id: 1, domain: DOMAIN.into() }, AuthPurpose::Login)).is_err());
    assert!(state::with_mut(|s| auth::prepare(s, Principal::anonymous(), T0, PrepareSignIn { address: a.address.clone(), chain_id: 8453, domain: DOMAIN.into() }, AuthPurpose::Login)).is_err());
}

#[test]
fn allowed_domains_are_enforced() {
    let a = Wallet::new(7);
    state::with_mut(|s| {
        let mut v = s.settings();
        v.allowed_domains = vec!["tactiball.app".into()];
        s.settings.set(state::Stored(v));
    });
    let r = |d: &str| state::with_mut(|s| auth::prepare(s, a.session, T0, PrepareSignIn { address: a.address.clone(), chain_id: 8453, domain: d.into() }, AuthPurpose::Login));
    assert!(r("tactiball.app").is_ok());
    assert!(r("evil.example").is_err());
}

#[test]
fn sessions_expire_and_ttl_is_a_user_setting() {
    let a = Wallet::new(7);
    a.sign_in(8453, T0);
    let later = T0 + 3 * DAY_SECS * SECOND;
    assert!(state::with(|s| auth::require_user(s, &a.session, later - 1)).is_ok());
    assert!(state::with(|s| auth::require_user(s, &a.session, later)).is_err());

    state::with_mut(|s| auth::set_session_ttl(s, a.session, T0, Some(DAY_SECS))).unwrap();
    assert!(state::with_mut(|s| auth::set_session_ttl(s, a.session, T0, Some(10))).is_err());
    let info = a.sign_in(8453, T0 + SECOND);
    assert_eq!(info.session_expires_at, T0 + SECOND + DAY_SECS * SECOND);
    assert!(!info.new_user);
}

#[test]
fn linked_wallets_share_one_user_across_chains() {
    let a = Wallet::new(7);
    let second = Wallet { session: a.session, ..Wallet::new(11) };
    let first = a.sign_in(8453, T0);
    let msg = state::with_mut(|s| {
        auth::prepare(s, a.session, T0, PrepareSignIn { address: second.address.clone(), chain_id: 4663, domain: DOMAIN.into() }, AuthPurpose::LinkWallet)
    })
    .unwrap();
    let user = state::with_mut(|s| auth::link_wallet(s, a.session, T0, &second.sign(&msg.message))).unwrap();
    assert_eq!(user.identities.len(), 2);

    // Signing in later with the linked wallet, from a new session, reaches the same user.
    let other_session = Wallet { session: Principal::self_authenticating([42]), ..Wallet::new(11) };
    let info = other_session.sign_in(4663, T0 + SECOND);
    assert_eq!(info.user.id, first.user.id);
    assert_eq!(info.user.home_chain, "eip155:8453");

    // The same EOA on another EVM chain is the same user too.
    let again = Wallet { session: Principal::self_authenticating([43]), ..Wallet::new(7) };
    assert_eq!(again.sign_in(4663, T0 + SECOND).user.id, first.user.id);
}

#[test]
fn team_names_are_unique_across_chains() {
    let (a, _b, _, _) = setup_two_teams();
    let c = Wallet::new(13);
    c.sign_in(4663, T0);
    assert!(state::with_mut(|s| teams::create_team(s, c.session, T0, "  red   LIONS ".into(), 1)).is_err());
    assert!(state::with_mut(|s| teams::create_team(s, a.session, T0, "Second".into(), 1)).is_err());
    let t = state::with_mut(|s| teams::create_team(s, c.session, T0, "  Green   Owls ".into(), 1)).unwrap();
    assert_eq!(t.name, "Green Owls");
    assert_eq!(t.home_chain, "eip155:4663");
    assert_eq!(state::with(|s| teams::search(s, "owl", 10)).len(), 1);
}

#[test]
fn full_game_by_invite_ends_after_max_turns() {
    let (a, b, ta, tb) = setup_two_teams();
    let req = state::with_mut(|s| lobby::create_request(s, a.session, T0, tb)).unwrap();
    // Only the invited team can accept.
    assert!(state::with_mut(|s| lobby::accept_request(s, a.session, T0, req.id)).is_err());
    let lob = state::with(|s| lobby::lobby(s, b.session, T0)).unwrap();
    assert_eq!(lob.incoming.len(), 1);
    let game_id = state::with_mut(|s| lobby::accept_request(s, b.session, T0, req.id)).unwrap();

    let mut now = T0;
    for turn in 1..=45 {
        now += 5 * SECOND;
        let r1 = state::with_mut(|s| games::commit_moves(s, a.session, now, game_id, turn, keeper_stays(Side::Team1))).unwrap();
        assert!(!r1.resolved);
        assert!(r1.game.committed1 && !r1.game.committed2);
        // Opponent's moves stay hidden from other viewers.
        let seen_by_b = state::with(|s| games::view(&s.game(game_id).unwrap(), Some(state::with(|s2| auth::require_user(s2, &b.session, now)).unwrap().id)));
        assert!(seen_by_b.my_pending.is_none());
        // Double commit and wrong turn are refused.
        assert!(state::with_mut(|s| games::commit_moves(s, a.session, now, game_id, turn, keeper_stays(Side::Team1))).is_err());
        let r2 = state::with_mut(|s| games::commit_moves(s, b.session, now, game_id, turn, keeper_stays(Side::Team2))).unwrap();
        assert!(r2.resolved);
    }
    let game = state::with(|s| s.game(game_id)).unwrap();
    assert_eq!(game.status, GameStatus::Finished);
    assert_eq!((game.score1, game.score2), (0, 0));
    assert_eq!(game.winner, None);
    assert_eq!(game.team1.elo_after, Some(10_000));
    assert_eq!(state::with(|s| games::turns(s, game_id, 1, 50)).len(), 45);

    let team_a = state::with(|s| s.team(ta)).unwrap();
    assert_eq!((team_a.games, team_a.draws, team_a.active_game), (1, 1, None));

    // Cross-chain game: queued for both home chains.
    let ov = state::with(ledger::overview);
    let mut chains: Vec<_> = ov.iter().map(|o| (o.chain.clone(), o.pending)).collect();
    chains.sort();
    assert_eq!(chains, vec![("eip155:4663".into(), 1), ("eip155:8453".into(), 1)]);
}

#[test]
fn invalid_moves_are_rejected_before_storing() {
    let (a, b, _, tb) = setup_two_teams();
    let req = state::with_mut(|s| lobby::create_request(s, a.session, T0, tb)).unwrap();
    let game_id = state::with_mut(|s| lobby::accept_request(s, b.session, T0, req.id)).unwrap();
    // Team 2 cannot pass: team 1 has the ball.
    let bad = vec![Move { player_id: 5, move_type: MoveType::Pass, from: Pos::new(10, 5), to: Pos::new(10, 3) }];
    assert!(state::with_mut(|s| games::commit_moves(s, b.session, T0, game_id, 1, bad)).is_err());
    // A stranger cannot play.
    let c = Wallet::new(13);
    c.sign_in(8453, T0);
    assert!(state::with_mut(|s| games::commit_moves(s, c.session, T0, game_id, 1, keeper_stays(Side::Team1))).is_err());
}

#[test]
fn queue_pairs_teams_and_timeout_awards_technical_win() {
    let (a, b, ta, tb) = setup_two_teams();
    assert_eq!(state::with_mut(|s| lobby::join_queue(s, a.session, T0)).unwrap(), None);
    let game_id = state::with_mut(|s| lobby::join_queue(s, b.session, T0 + SECOND)).unwrap().expect("paired");
    let game = state::with(|s| s.game(game_id)).unwrap();
    assert_eq!((game.team1.team_id, game.team2.team_id), (ta, tb));

    // Only team 1 commits; the deadline passes.
    state::with_mut(|s| games::commit_moves(s, a.session, T0 + 2 * SECOND, game_id, 1, keeper_stays(Side::Team1))).unwrap();
    state::with_mut(|s| games::check_timeouts(s, T0 + 30 * SECOND));
    assert_eq!(state::with(|s| s.game(game_id)).unwrap().status, GameStatus::Active);
    state::with_mut(|s| games::check_timeouts(s, T0 + SECOND + 61 * SECOND));
    let game = state::with(|s| s.game(game_id)).unwrap();
    assert_eq!(game.status, GameStatus::FinishedByTimeout);
    assert_eq!((game.score1, game.score2, game.winner), (3, 0, Some(Side::Team1)));
    let (t1, t2) = state::with(|s| (s.team(ta).unwrap(), s.team(tb).unwrap()));
    assert_eq!((t1.elo, t2.elo), (10_000, 10_000));
    assert_eq!((t1.wins, t2.losses), (1, 1));
    assert!(t1.active_game.is_none() && t2.active_game.is_none());
}

#[test]
fn nobody_moving_abandons_the_game() {
    let (a, b, _, _) = setup_two_teams();
    state::with_mut(|s| lobby::join_queue(s, a.session, T0)).unwrap();
    let game_id = state::with_mut(|s| lobby::join_queue(s, b.session, T0)).unwrap().unwrap();
    state::with_mut(|s| games::check_timeouts(s, T0 + 61 * SECOND));
    let game = state::with(|s| s.game(game_id)).unwrap();
    assert_eq!(game.status, GameStatus::Abandoned);
    assert!(state::with(ledger::overview).is_empty());
}

#[test]
fn surrender_and_requests_expire() {
    let (a, b, _, tb) = setup_two_teams();
    let req = state::with_mut(|s| lobby::create_request(s, a.session, T0, tb)).unwrap();
    state::with_mut(|s| lobby::expire(s, T0 + 11 * 60 * SECOND));
    assert!(state::with_mut(|s| lobby::accept_request(s, b.session, T0 + 11 * 60 * SECOND, req.id)).is_err());

    let req = state::with_mut(|s| lobby::create_request(s, a.session, T0, tb)).unwrap();
    let game_id = state::with_mut(|s| lobby::accept_request(s, b.session, T0, req.id)).unwrap();
    let v = state::with_mut(|s| games::surrender(s, b.session, T0, game_id)).unwrap();
    assert_eq!((v.status, v.winner, v.score1, v.score2), (GameStatus::Surrendered, Some(Side::Team1), 3, 0));
}

#[test]
fn verification_policy_hook_blocks_when_enabled() {
    let (a, _b, _, _) = setup_two_teams();
    state::with_mut(|s| {
        let mut v = s.settings();
        v.game_modes = vec![GameModePolicy { mode: GameMode::Queue, requires_verification: Some(VerificationLevel::Orb) }];
        s.settings.set(state::Stored(v));
    });
    assert!(state::with_mut(|s| lobby::join_queue(s, a.session, T0)).is_err());
}

#[test]
fn rolls_are_replayable_from_the_seed() {
    let mut r1 = games::roller(vec![1, 2, 3]);
    let mut r2 = games::roller(vec![1, 2, 3]);
    let a: Vec<u8> = (0..10).map(|_| r1()).collect();
    let b: Vec<u8> = (0..10).map(|_| r2()).collect();
    assert_eq!(a, b);
    assert!(a.iter().all(|r| *r < 100));
}

#[test]
fn candid_interface_is_up_to_date() {
    let did = crate::__export_service();
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/backend.did");
    if std::env::var("UPDATE_CANDID").is_ok() {
        std::fs::write(path, &did).unwrap();
    }
    let on_disk = std::fs::read_to_string(path).unwrap_or_default();
    assert_eq!(on_disk.trim(), did.trim(), "backend.did is stale: run `UPDATE_CANDID=1 cargo test -p tactiball_backend candid`");
}
