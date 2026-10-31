//! Email + password accounts, alongside wallet sign-in.
//!
//! The browser never sends the password itself. It sends a 32-byte
//! `password_key` = PBKDF2-HMAC-SHA256(password, "tactiball:" + email,
//! 210 000 rounds), so replicas and node providers that see the call never see
//! a password the player may reuse elsewhere. The canister then stores only
//! PBKDF2-HMAC-SHA256(password_key, random salt, `ITERATIONS`).
//!
//! Like wallet sign-in, a successful sign-up or login binds the caller's
//! session key to the user. An email can be added to a wallet account
//! (`link`) and a wallet to an email account (`auth::link_wallet`), so one
//! player can sign in either way.
//!
//! Emails are not verified yet: the canister cannot send mail without an
//! HTTPS outcall to a mail provider. Accounts are keyed by the address as
//! typed (lower-cased), so someone could register an address they don't own.

use crate::auth;
use crate::state::{Stored, Store};
use crate::types::*;
use candid::Principal;
use sha2::{Digest, Sha256};

pub const KEY_LEN: usize = 32;
/// Server-side rounds on top of the browser's 210 000.
pub const ITERATIONS: u32 = 10_000;
/// Wrong passwords allowed before the account is locked for a while.
pub const MAX_FAILURES: u32 = 5;
pub const LOCK_SECS: u64 = 15 * 60;
/// Shown in the public event log instead of the address.
pub const PUBLIC_IDENTITY: &str = "email";

pub fn email_identity(email: &str) -> String {
    format!("email:{email}")
}

/// Trims and lower-cases `raw` and checks it looks like an address.
pub fn normalize(raw: &str) -> Res<String> {
    let email = raw.trim().to_ascii_lowercase();
    let valid = email.len() <= 254
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && local.len() <= 64
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
                && !domain.contains('@')
        })
        && email.chars().all(|c| c.is_ascii_graphic());
    if valid { Ok(email) } else { Err("enter a valid email address".into()) }
}

fn derive(key: &[u8], salt: &[u8], rounds: u32) -> Vec<u8> {
    let mut out = [0u8; KEY_LEN];
    pbkdf2::pbkdf2_hmac::<Sha256>(key, salt, rounds, &mut out);
    out.to_vec()
}

fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn new_salt(s: &mut Store, caller: &Principal, now: Timestamp) -> Vec<u8> {
    let (counter, entropy) = s.update_meta(|m| {
        m.nonce_counter += 1;
        (m.nonce_counter, m.entropy.clone())
    });
    let mut h = Sha256::new();
    h.update(b"tactiball-email-salt");
    h.update(&entropy);
    h.update(counter.to_be_bytes());
    h.update(now.to_be_bytes());
    h.update(caller.as_slice());
    h.finalize()[..16].to_vec()
}

fn check(caller: &Principal, creds: &EmailCredentials) -> Res<String> {
    if *caller == Principal::anonymous() {
        return Err("sign-in must be called with a session key, not anonymously".into());
    }
    if creds.password_key.len() != KEY_LEN {
        return Err("invalid password key".into());
    }
    normalize(&creds.email)
}

fn credential(s: &mut Store, caller: &Principal, now: Timestamp, user_id: UserId, key: &[u8]) -> EmailCredential {
    let salt = new_salt(s, caller, now);
    let hash = derive(key, &salt, ITERATIONS);
    EmailCredential { user_id, salt, hash, iterations: ITERATIONS, failed_attempts: 0, locked_until: 0, created_at: now, password_changed_at: now }
}

/// Creates an account for a new email and signs the caller in.
pub fn sign_up(s: &mut Store, caller: Principal, now: Timestamp, creds: EmailCredentials) -> Res<SessionInfo> {
    let email = check(&caller, &creds)?;
    let identity = email_identity(&email);
    if s.emails.contains_key(&email) || s.identities.contains_key(&identity) {
        return Err("an account with this email already exists, log in instead".into());
    }
    // No home chain until a wallet is linked; games are not written to any chain.
    let user = auth::create_user(s, now, &identity, PUBLIC_IDENTITY, String::new());
    let cred = credential(s, &caller, now, user.id, &creds.password_key);
    s.emails.insert(email, Stored(cred));
    let expires_at = now + auth::session_ttl(s, Some(&user)) * SECOND;
    Ok(auth::start_session(s, caller, now, user, identity, 0, expires_at, true))
}

/// Checks the password for `email`, counting failures and locking the
/// account after `MAX_FAILURES` in a row.
fn verify(s: &mut Store, now: Timestamp, email: &str, key: &[u8]) -> Res<EmailCredential> {
    const WRONG: &str = "wrong email or password";
    let Some(Stored(mut cred)) = s.emails.get(&email.to_string()) else {
        return Err(WRONG.into());
    };
    if cred.locked_until > now {
        let mins = (cred.locked_until - now).div_ceil(60 * SECOND);
        return Err(format!("too many wrong passwords, try again in {mins} min"));
    }
    if !same(&derive(key, &cred.salt, cred.iterations), &cred.hash) {
        cred.failed_attempts += 1;
        if cred.failed_attempts >= MAX_FAILURES {
            cred.failed_attempts = 0;
            cred.locked_until = now + LOCK_SECS * SECOND;
        }
        s.emails.insert(email.to_string(), Stored(cred));
        return Err(WRONG.into());
    }
    if cred.failed_attempts > 0 {
        cred.failed_attempts = 0;
        s.emails.insert(email.to_string(), Stored(cred.clone()));
    }
    Ok(cred)
}

pub fn login(s: &mut Store, caller: Principal, now: Timestamp, creds: EmailCredentials) -> Res<SessionInfo> {
    let email = check(&caller, &creds)?;
    let cred = verify(s, now, &email, &creds.password_key)?;
    let user = s.user(cred.user_id).ok_or("account not found")?;
    let expires_at = now + auth::session_ttl(s, Some(&user)) * SECOND;
    Ok(auth::start_session(s, caller, now, user, email_identity(&email), 0, expires_at, false))
}

/// Adds an email login to the signed-in account (e.g. a wallet account).
pub fn link(s: &mut Store, caller: Principal, now: Timestamp, creds: EmailCredentials) -> Res<User> {
    let mut user = auth::require_user(s, &caller, now)?;
    let email = check(&caller, &creds)?;
    let identity = email_identity(&email);
    if let Some(owner) = s.identities.get(&identity) {
        return Err(if owner == user.id { "this email is already on your account" } else { "this email belongs to another TactiBall account" }.into());
    }
    if user.identities.iter().any(|i| i.starts_with("email:")) {
        return Err("your account already has an email login".into());
    }
    let cred = credential(s, &caller, now, user.id, &creds.password_key);
    s.emails.insert(email, Stored(cred));
    s.identities.insert(identity.clone(), user.id);
    user.identities.push(identity);
    s.put_user(user.clone());
    s.emit(now, EventKind::EmailLinked { user_id: user.id });
    Ok(user)
}

/// Replaces the password of the signed-in account's email login.
pub fn change_password(s: &mut Store, caller: Principal, now: Timestamp, old_key: &[u8], new_key: &[u8]) -> Res<()> {
    let user = auth::require_user(s, &caller, now)?;
    let email = user.identities.iter().find_map(|i| i.strip_prefix("email:")).ok_or("your account has no email login")?.to_string();
    if new_key.len() != KEY_LEN {
        return Err("invalid password key".into());
    }
    verify(s, now, &email, old_key)?;
    let mut cred = credential(s, &caller, now, user.id, new_key);
    cred.created_at = s.emails.get(&email).map_or(now, |c| c.0.created_at);
    s.emails.insert(email, Stored(cred));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_validates_addresses() {
        assert_eq!(normalize("  Vlad@Example.COM ").unwrap(), "vlad@example.com");
        for bad in ["", "vlad", "@example.com", "vlad@", "vlad@example", "vlad@.com", "a b@example.com", "vlad@@example.com"] {
            assert!(normalize(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn pbkdf2_matches_rfc_7914_vector() {
        // RFC 7914 §11: PBKDF2-HMAC-SHA256("passwd", "salt", 1, 64).
        let mut out = [0u8; 64];
        pbkdf2::pbkdf2_hmac::<Sha256>(b"passwd", b"salt", 1, &mut out);
        assert_eq!(hex::encode(&out[..16]), "55ac046e56e3089fec1691c22544b605");
    }
}
