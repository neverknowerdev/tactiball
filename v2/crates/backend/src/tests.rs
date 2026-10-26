//! End-to-end tests of the canister logic, run natively (`cargo test`).
//! Each test runs on its own thread, so each gets a fresh stable memory.

use crate::types::*;
use crate::{auth, email, eth, games, ledger, lobby, state, teams};
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

fn creds(email: &str, password: &str) -> EmailCredentials {
    // Stands in for the browser's PBKDF2 key; any 32 bytes work here.
    let mut key = [0u8; 32];
    for (i, b) in password.bytes().enumerate() {
        key[i % 32] ^= b;
    }
    EmailCredentials { email: email.into(), password_key: key.to_vec() }
}

fn session(n: u8) -> Principal {
    Principal::self_authenticating([n, 200])
}

#[test]
fn email_sign_up_and_login() {
    let first = state::with_mut(|s| email::sign_up(s, session(1), T0, creds("Vlad@Example.com", "correct horse"))).unwrap();
    assert!(first.new_user);
    assert_eq!(first.user.identities, vec!["email:vlad@example.com".to_string()]);
    assert_eq!(first.user.home_chain, "");
    assert_eq!(first.session_expires_at, T0 + 3 * DAY_SECS * SECOND);
    let team = state::with_mut(|s| teams::create_team(s, session(1), T0, "Inbox United".into(), 3)).unwrap();

    // The address is case-insensitive and can only be registered once.
    let dup = state::with_mut(|s| email::sign_up(s, session(2), T0, creds("vlad@example.com ", "other"))).unwrap_err();
    assert!(dup.contains("already exists"), "{dup}");
    assert!(state::with_mut(|s| email::sign_up(s, session(2), T0, creds("not-an-email", "x"))).is_err());
    assert!(state::with_mut(|s| email::sign_up(s, Principal::anonymous(), T0, creds("a@b.co", "x"))).is_err());
    let short = EmailCredentials { email: "a@b.co".into(), password_key: vec![1; 8] };
    assert!(state::with_mut(|s| email::sign_up(s, session(2), T0, short)).is_err());

    // Logging in from another browser reaches the same user and team.
    let info = state::with_mut(|s| email::login(s, session(3), T0 + SECOND, creds("VLAD@example.com", "correct horse"))).unwrap();
    assert_eq!(info.user.id, first.user.id);
    assert!(!info.new_user);
    assert_eq!(info.team.map(|t| t.id), Some(team.id));
    assert!(state::with(|s| auth::session_user(s, &session(3), T0 + SECOND)).is_some());

    // Unknown address and wrong password fail the same way.
    let unknown = state::with_mut(|s| email::login(s, session(4), T0, creds("nobody@example.com", "x"))).unwrap_err();
    let wrong = state::with_mut(|s| email::login(s, session(4), T0, creds("vlad@example.com", "wrong"))).unwrap_err();
    assert_eq!(unknown, wrong);
    assert!(state::with(|s| auth::session_user(s, &session(4), T0)).is_none());

    // The public event log never shows the address.
    let events = state::with(|s| s.events.values().map(|e| format!("{:?}", e.0)).collect::<Vec<_>>().join("\n"));
    assert!(!events.contains("example.com"), "{events}");
}

#[test]
fn wrong_passwords_lock_the_account_for_a_while() {
    state::with_mut(|s| email::sign_up(s, session(1), T0, creds("a@example.com", "right"))).unwrap();
    for _ in 0..email::MAX_FAILURES {
        assert!(state::with_mut(|s| email::login(s, session(2), T0, creds("a@example.com", "guess"))).is_err());
    }
    let locked = state::with_mut(|s| email::login(s, session(2), T0, creds("a@example.com", "right"))).unwrap_err();
    assert!(locked.contains("try again in 15 min"), "{locked}");
    let later = T0 + email::LOCK_SECS * SECOND;
    assert!(state::with_mut(|s| email::login(s, session(2), later, creds("a@example.com", "right"))).is_ok());

    // A success resets the count.
    for _ in 0..email::MAX_FAILURES - 1 {
        assert!(state::with_mut(|s| email::login(s, session(2), later, creds("a@example.com", "guess"))).is_err());
    }
    assert!(state::with_mut(|s| email::login(s, session(2), later, creds("a@example.com", "right"))).is_ok());
    assert!(state::with_mut(|s| email::login(s, session(2), later, creds("a@example.com", "guess"))).is_err());
    assert!(state::with_mut(|s| email::login(s, session(2), later, creds("a@example.com", "right"))).is_ok());
}

#[test]
fn password_can_be_changed() {
    state::with_mut(|s| email::sign_up(s, session(1), T0, creds("a@example.com", "old"))).unwrap();
    let old = creds("a@example.com", "old").password_key;
    let new = creds("a@example.com", "new").password_key;
    assert!(state::with_mut(|s| email::change_password(s, session(1), T0, &new, &new)).is_err());
    state::with_mut(|s| email::change_password(s, session(1), T0, &old, &new)).unwrap();
    assert!(state::with_mut(|s| email::login(s, session(2), T0, creds("a@example.com", "old"))).is_err());
    assert!(state::with_mut(|s| email::login(s, session(2), T0, creds("a@example.com", "new"))).is_ok());
}

#[test]
fn wallet_account_adds_an_email_login() {
    let a = Wallet::new(7);
    let first = a.sign_in(8453, T0);
    let user = state::with_mut(|s| email::link(s, a.session, T0, creds("A@example.com", "pw"))).unwrap();
    assert_eq!(user.identities, vec![format!("eip155:{}", a.address), "email:a@example.com".to_string()]);
    assert!(state::with_mut(|s| email::link(s, a.session, T0, creds("b@example.com", "pw"))).unwrap_err().contains("already has an email"));

    let info = state::with_mut(|s| email::login(s, session(9), T0, creds("a@example.com", "pw"))).unwrap();
    assert_eq!(info.user.id, first.user.id);
    assert_eq!(info.user.home_chain, "eip155:8453");

    // Someone else cannot take the address, by sign-up or by linking.
    assert!(state::with_mut(|s| email::sign_up(s, session(10), T0, creds("a@example.com", "pw"))).is_err());
    let b = Wallet::new(9);
    b.sign_in(4663, T0);
    assert!(state::with_mut(|s| email::link(s, b.session, T0, creds("a@example.com", "pw"))).unwrap_err().contains("another"));
    // Linking needs a session.
    assert!(state::with_mut(|s| email::link(s, session(11), T0, creds("c@example.com", "pw"))).is_err());
}

#[test]
fn email_account_links_a_wallet_and_gets_its_home_chain() {
    let user = state::with_mut(|s| email::sign_up(s, session(1), T0, creds("a@example.com", "pw"))).unwrap().user;
    let w = Wallet { session: session(1), ..Wallet::new(7) };
    let msg = state::with_mut(|s| {
        auth::prepare(s, w.session, T0, PrepareSignIn { address: w.address.clone(), chain_id: 4663, domain: DOMAIN.into() }, AuthPurpose::LinkWallet)
    })
    .unwrap();
    let linked = state::with_mut(|s| auth::link_wallet(s, w.session, T0, &w.sign(&msg.message))).unwrap();
    assert_eq!(linked.home_chain, "eip155:4663");
    assert_eq!(linked.identities.len(), 2);

    // The wallet now signs in to the same account.
    let from_wallet = Wallet { session: session(2), ..Wallet::new(7) };
    assert_eq!(from_wallet.sign_in(8453, T0).user.id, user.id);
}

#[test]
fn a_wallet_link_only_completes_for_the_account_that_started_it() {
    // Email account A starts a link; another tab then logs the shared
    // session key into email account B before A's signature arrives.
    let a = state::with_mut(|s| email::sign_up(s, session(1), T0, creds("a@example.com", "pw"))).unwrap().user;
    let b = state::with_mut(|s| email::sign_up(s, session(9), T0, creds("b@example.com", "pw"))).unwrap().user;
    let w = Wallet { session: session(1), ..Wallet::new(7) };
    let msg = state::with_mut(|s| {
        auth::prepare(s, w.session, T0, PrepareSignIn { address: w.address.clone(), chain_id: 8453, domain: DOMAIN.into() }, AuthPurpose::LinkWallet)
    })
    .unwrap();
    state::with_mut(|s| email::login(s, session(1), T0, creds("b@example.com", "pw"))).unwrap();
    let err = state::with_mut(|s| auth::link_wallet(s, w.session, T0, &w.sign(&msg.message))).unwrap_err();
    assert!(err.contains("another account"), "{err}");
    assert_eq!(state::with(|s| s.user(b.id)).unwrap().identities.len(), 1);

    // The wallet is still free, so A can link it.
    state::with_mut(|s| email::login(s, session(1), T0, creds("a@example.com", "pw"))).unwrap();
    let msg = state::with_mut(|s| {
        auth::prepare(s, w.session, T0, PrepareSignIn { address: w.address.clone(), chain_id: 8453, domain: DOMAIN.into() }, AuthPurpose::LinkWallet)
    })
    .unwrap();
    let linked = state::with_mut(|s| auth::link_wallet(s, w.session, T0, &w.sign(&msg.message))).unwrap();
    assert_eq!(linked.id, a.id);
}

#[test]
fn tabs_sharing_a_session_key_keep_their_own_challenges() {
    // Two tabs, one session key: both prepare before either signs.
    let shared = session(5);
    let a = Wallet { session: shared, ..Wallet::new(11) };
    let b = Wallet { session: shared, ..Wallet::new(12) };
    let prep = |w: &Wallet| {
        state::with_mut(|s| auth::prepare(s, shared, T0, PrepareSignIn { address: w.address.clone(), chain_id: 8453, domain: DOMAIN.into() }, AuthPurpose::Login)).unwrap()
    };
    let msg_a = prep(&a);
    let msg_b = prep(&b);
    // A's signature still matches A's challenge, then B's matches B's.
    let info_a = state::with_mut(|s| auth::login(s, shared, T0, &a.sign(&msg_a.message))).unwrap();
    assert!(info_a.user.identities.contains(&format!("eip155:{}", a.address)));
    let info_b = state::with_mut(|s| auth::login(s, shared, T0, &b.sign(&msg_b.message))).unwrap();
    assert!(info_b.user.identities.contains(&format!("eip155:{}", b.address)));
    // Each challenge is one-time.
    assert!(state::with_mut(|s| auth::login(s, shared, T0, &a.sign(&msg_a.message))).is_err());
    // A wallet can't sign another tab's challenge.
    let msg_a = prep(&a);
    let err = state::with_mut(|s| auth::login(s, shared, T0, &b.sign(&msg_a.message))).unwrap_err();
    assert!(err.contains("different wallet"), "{err}");
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
fn queue_pairs_teams_and_timeout_win_is_claimed() {
    let (a, b, ta, tb) = setup_two_teams();
    assert_eq!(state::with_mut(|s| lobby::join_queue(s, a.session, T0)).unwrap(), None);
    let game_id = state::with_mut(|s| lobby::join_queue(s, b.session, T0 + SECOND)).unwrap().expect("paired");
    let game = state::with(|s| s.game(game_id)).unwrap();
    assert_eq!((game.team1.team_id, game.team2.team_id), (ta, tb));
    let late = T0 + SECOND + 61 * SECOND;

    // Only team 1 commits. Before the deadline it cannot claim.
    state::with_mut(|s| games::commit_moves(s, a.session, T0 + 2 * SECOND, game_id, 1, keeper_stays(Side::Team1))).unwrap();
    let early = state::with_mut(|s| games::claim_timeout_win(s, a.session, T0 + 30 * SECOND, game_id)).unwrap_err();
    assert!(early.contains("still has 31s"), "{early}");
    // After it, the late side cannot claim, and the game is still on until someone does.
    assert!(state::with_mut(|s| games::claim_timeout_win(s, b.session, late, game_id)).unwrap_err().contains("make your move first"));
    assert_eq!(state::with(|s| s.game(game_id)).unwrap().status, GameStatus::Active);

    let v = state::with_mut(|s| games::claim_timeout_win(s, a.session, late, game_id)).unwrap();
    assert_eq!((v.status, v.score1, v.score2, v.winner), (GameStatus::FinishedByTimeout, 3, 0, Some(Side::Team1)));
    let (t1, t2) = state::with(|s| (s.team(ta).unwrap(), s.team(tb).unwrap()));
    assert_eq!((t1.elo, t2.elo), (10_000, 10_000));
    assert_eq!((t1.wins, t2.losses), (1, 1));
    assert!(t1.active_game.is_none() && t2.active_game.is_none());
    assert!(state::with_mut(|s| games::claim_timeout_win(s, a.session, late, game_id)).is_err());
}

#[test]
fn a_late_move_still_counts_until_the_win_is_claimed() {
    let (a, b, _, _) = setup_two_teams();
    state::with_mut(|s| lobby::join_queue(s, a.session, T0)).unwrap();
    let game_id = state::with_mut(|s| lobby::join_queue(s, b.session, T0)).unwrap().unwrap();
    state::with_mut(|s| games::commit_moves(s, a.session, T0, game_id, 1, keeper_stays(Side::Team1))).unwrap();
    // Team 2 moves well after the deadline; team 1 chose not to claim, so the turn resolves.
    let r = state::with_mut(|s| games::commit_moves(s, b.session, T0 + 300 * SECOND, game_id, 1, keeper_stays(Side::Team2))).unwrap();
    assert!(r.resolved);
    assert_eq!((r.game.status, r.game.turns_played), (GameStatus::Active, 1));
    // The next turn's clock started at the late move, so nobody can claim yet.
    assert!(state::with_mut(|s| games::claim_timeout_win(s, a.session, T0 + 301 * SECOND, game_id)).is_err());
}

#[test]
fn nobody_moving_does_not_end_the_game() {
    let (a, b, _, _) = setup_two_teams();
    state::with_mut(|s| lobby::join_queue(s, a.session, T0)).unwrap();
    let game_id = state::with_mut(|s| lobby::join_queue(s, b.session, T0)).unwrap().unwrap();
    let later = T0 + 3600 * SECOND;
    for p in [a.session, b.session] {
        assert!(state::with_mut(|s| games::claim_timeout_win(s, p, later, game_id)).unwrap_err().contains("make your move first"));
    }
    assert_eq!(state::with(|s| s.game(game_id)).unwrap().status, GameStatus::Active);
    // Either side can still move, or give up.
    state::with_mut(|s| games::commit_moves(s, b.session, later, game_id, 1, keeper_stays(Side::Team2))).unwrap();
    assert!(state::with_mut(|s| games::claim_timeout_win(s, b.session, later + 61 * SECOND, game_id)).is_ok());
    assert_eq!(state::with(|s| s.game(game_id)).unwrap().winner, Some(Side::Team2));
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
fn team_by_wallet_and_form() {
    let (a, b, ta, _) = setup_two_teams();
    // Lookup is by address, any case; unknown and malformed addresses differ.
    let found = state::with(|s| teams::by_wallet(s, &a.address.to_uppercase().replacen("0X", "0x", 1))).unwrap();
    assert_eq!(found.map(|t| t.id), Some(ta));
    assert_eq!(state::with(|s| teams::by_wallet(s, "0x0000000000000000000000000000000000000001")).unwrap(), None);
    assert!(state::with(|s| teams::by_wallet(s, "nope")).is_err());

    state::with_mut(|s| lobby::join_queue(s, a.session, T0)).unwrap();
    let game_id = state::with_mut(|s| lobby::join_queue(s, b.session, T0)).unwrap().unwrap();
    state::with_mut(|s| games::surrender(s, b.session, T0, game_id)).unwrap();
    let (fa, fb) = state::with(|s| (teams::team_view(s, ta).unwrap().form, teams::by_wallet(s, &b.address).unwrap().unwrap().form));
    assert_eq!((fa, fb), (vec![Outcome::Win], vec![Outcome::Loss]));
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
