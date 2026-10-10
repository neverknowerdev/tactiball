//! Wallet sign-in (PoC: EVM EOAs on Base and Robinhood Chain).
//!
//! Flow:
//! 1. The browser makes an Ed25519 session key; its self-authenticating
//!    principal is the caller of every request.
//! 2. `auth_prepare` returns an EIP-4361 (SIWE) message that names that
//!    session principal, a one-time nonce, the chain and an expiry.
//! 3. The wallet signs it (personal_sign); `auth_login` is called by the same
//!    session principal with the signature. The canister recovers the signer
//!    with secp256k1, finds or creates the user, and binds the session
//!    principal to that user until the session expires (3 days by default).
//!
//! Because the message names the session principal and `auth_login` must come
//! from that principal, a captured signature is useless to anyone else.
//! Smart-wallet signatures (ERC-1271 / ERC-6492) are not accepted yet.

use crate::eth;
use crate::state::{Stored, Store};
use crate::types::*;
use candid::Principal;
use sha2::{Digest, Sha256};

pub const STATEMENT: &str = "Sign in to TactiBall. This starts a game session and does not send a transaction or cost gas.";

/// Identity key for an EOA: chain-agnostic, since one key controls the same
/// address on every EVM chain.
pub fn evm_identity(address_lower: &str) -> String {
    format!("eip155:{address_lower}")
}

pub fn caip2(chain_id: u64) -> String {
    format!("eip155:{chain_id}")
}

pub fn now_secs(now: Timestamp) -> u64 {
    now / SECOND
}

/// RFC 3339 / ISO 8601 UTC time from IC nanoseconds.
pub fn iso8601(now: Timestamp) -> String {
    let secs = now / SECOND;
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Civil-from-days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60)
}

#[allow(clippy::too_many_arguments)]
pub fn build_message(
    domain: &str,
    address_checksummed: &str,
    statement: &str,
    chain_id: u64,
    nonce: &str,
    issued_at: Timestamp,
    expires_at: Timestamp,
    session: &Principal,
    session_expires_at: Timestamp,
) -> String {
    format!(
        "{domain} wants you to sign in with your Ethereum account:\n\
         {address_checksummed}\n\
         \n\
         {statement} Session valid until {session_until}.\n\
         \n\
         URI: https://{domain}\n\
         Version: 1\n\
         Chain ID: {chain_id}\n\
         Nonce: {nonce}\n\
         Issued At: {issued}\n\
         Expiration Time: {expires}\n\
         Resources:\n\
         - icp:session:{session}",
        session_until = iso8601(session_expires_at),
        issued = iso8601(issued_at),
        expires = iso8601(expires_at),
        session = session.to_text(),
    )
}

fn valid_domain(domain: &str) -> bool {
    !domain.is_empty()
        && domain.len() <= 253
        && domain.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '[' | ']'))
}

fn make_nonce(s: &mut Store, caller: &Principal, now: Timestamp) -> String {
    let (counter, entropy) = s.update_meta(|m| {
        m.nonce_counter += 1;
        (m.nonce_counter, m.entropy.clone())
    });
    let mut h = Sha256::new();
    h.update(&entropy);
    h.update(counter.to_be_bytes());
    h.update(now.to_be_bytes());
    h.update(caller.as_slice());
    let digest: [u8; 32] = h.finalize().into();
    hex::encode(&digest[..12])
}

pub fn session_user(s: &Store, caller: &Principal, now: Timestamp) -> Option<(Session, User)> {
    let session = s.sessions.get(caller)?.0;
    if session.expires_at <= now {
        return None;
    }
    let user = s.user(session.user_id)?;
    Some((session, user))
}

pub fn require_user(s: &Store, caller: &Principal, now: Timestamp) -> Res<User> {
    session_user(s, caller, now).map(|(_, u)| u).ok_or_else(|| "not signed in (or the session expired)".to_string())
}

pub fn prepare(s: &mut Store, caller: Principal, now: Timestamp, req: PrepareSignIn, purpose: AuthPurpose) -> Res<SignInMessage> {
    if caller == Principal::anonymous() {
        return Err("sign-in must be called with a session key, not anonymously".into());
    }
    let settings = s.settings();
    let address = eth::normalize_address(&req.address)?;
    let chain = settings
        .chains
        .iter()
        .find(|c| c.chain_id == req.chain_id && c.enabled)
        .ok_or_else(|| format!("chain {} is not supported", req.chain_id))?;
    let domain = req.domain.trim().to_ascii_lowercase();
    if !valid_domain(&domain) {
        return Err("invalid domain".into());
    }
    if !settings.allowed_domains.is_empty() && !settings.allowed_domains.iter().any(|d| d.eq_ignore_ascii_case(&domain)) {
        return Err(format!("domain {domain} is not allowed"));
    }

    let session_ttl = match purpose {
        AuthPurpose::Login => s
            .identities
            .get(&evm_identity(&address))
            .and_then(|uid| s.user(uid))
            .and_then(|u| u.session_ttl_secs)
            .unwrap_or(settings.default_session_ttl_secs),
        AuthPurpose::LinkWallet => {
            let (session, _) = session_user(s, &caller, now).ok_or("sign in before linking another wallet")?;
            // Linking does not extend the current session.
            (session.expires_at.saturating_sub(now)) / SECOND
        }
    };
    let expires_at = now + settings.sign_in_ttl_secs * SECOND;
    let session_expires_at = now + session_ttl * SECOND;
    let nonce = make_nonce(s, &caller, now);
    let statement = match purpose {
        AuthPurpose::Login => STATEMENT.to_string(),
        AuthPurpose::LinkWallet => format!("Link this wallet to your TactiBall account. Signed in on {}.", chain.name),
    };
    let message = build_message(&domain, &eth::to_checksum(&address), &statement, req.chain_id, &nonce, now, expires_at, &caller, session_expires_at);

    s.pending_auth.insert(
        caller,
        Stored(PendingAuth { purpose, address, chain_id: req.chain_id, message: message.clone(), expires_at, session_expires_at }),
    );
    Ok(SignInMessage { message, expires_at, session_expires_at })
}

/// Verifies the signed message for the caller's pending sign-in and returns
/// the pending record (consumed).
fn take_verified(s: &mut Store, caller: &Principal, now: Timestamp, purpose: AuthPurpose, signature: &str) -> Res<PendingAuth> {
    let pending = s.pending_auth.get(caller).map(|p| p.0).ok_or("no sign-in in progress for this session key")?;
    if pending.purpose != purpose {
        return Err("sign-in purpose does not match".into());
    }
    if pending.expires_at <= now {
        s.pending_auth.remove(caller);
        return Err("sign-in message expired, please try again".into());
    }
    let signer = eth::recover_personal_sign(&pending.message, signature)?;
    if signer != pending.address {
        return Err("signature was made by a different wallet".into());
    }
    // One-time: the nonce cannot be used again.
    s.pending_auth.remove(caller);
    Ok(pending)
}

pub fn login(s: &mut Store, caller: Principal, now: Timestamp, signature: &str) -> Res<SessionInfo> {
    let pending = take_verified(s, &caller, now, AuthPurpose::Login, signature)?;
    let identity = evm_identity(&pending.address);

    let (mut user, new_user) = match s.identities.get(&identity).and_then(|id| s.user(id)) {
        Some(u) => (u, false),
        None => {
            let id = s.update_meta(|m| {
                let id = m.next_user_id;
                m.next_user_id += 1;
                id
            });
            let user = User {
                id,
                created_at: now,
                home_chain: caip2(pending.chain_id),
                identities: vec![identity.clone()],
                team_id: None,
                verifications: vec![],
                session_ttl_secs: None,
                last_login_at: now,
            };
            s.identities.insert(identity.clone(), id);
            s.emit(now, EventKind::UserCreated { user_id: id, identity: identity.clone(), home_chain: user.home_chain.clone() });
            (user, true)
        }
    };
    user.last_login_at = now;
    s.put_user(user.clone());
    s.sessions.insert(
        caller,
        Stored(Session { user_id: user.id, identity, chain_id: pending.chain_id, created_at: now, expires_at: pending.session_expires_at }),
    );
    let team = user.team_id.and_then(|t| crate::teams::team_view(s, t));
    Ok(SessionInfo { user, team, session_expires_at: pending.session_expires_at, new_user })
}

pub fn link_wallet(s: &mut Store, caller: Principal, now: Timestamp, signature: &str) -> Res<User> {
    let mut user = require_user(s, &caller, now)?;
    let pending = take_verified(s, &caller, now, AuthPurpose::LinkWallet, signature)?;
    let identity = evm_identity(&pending.address);
    match s.identities.get(&identity) {
        Some(owner) if owner == user.id => return Ok(user),
        Some(_) => return Err("this wallet already belongs to another TactiBall account".into()),
        None => {}
    }
    s.identities.insert(identity.clone(), user.id);
    user.identities.push(identity.clone());
    s.put_user(user.clone());
    s.emit(now, EventKind::WalletLinked { user_id: user.id, identity });
    Ok(user)
}

pub fn set_home_chain(s: &mut Store, caller: Principal, now: Timestamp, chain_id: u64) -> Res<User> {
    let mut user = require_user(s, &caller, now)?;
    if !s.settings().chains.iter().any(|c| c.chain_id == chain_id && c.enabled) {
        return Err(format!("chain {chain_id} is not supported"));
    }
    user.home_chain = caip2(chain_id);
    s.put_user(user.clone());
    Ok(user)
}

pub fn set_session_ttl(s: &mut Store, caller: Principal, now: Timestamp, secs: Option<u64>) -> Res<User> {
    let mut user = require_user(s, &caller, now)?;
    let settings = s.settings();
    if let Some(v) = secs {
        if v < settings.min_session_ttl_secs || v > settings.max_session_ttl_secs {
            return Err(format!("session length must be between {} and {} seconds", settings.min_session_ttl_secs, settings.max_session_ttl_secs));
        }
    }
    user.session_ttl_secs = secs;
    s.put_user(user.clone());
    Ok(user)
}

pub fn sign_out(s: &mut Store, caller: Principal) {
    s.sessions.remove(&caller);
    s.pending_auth.remove(&caller);
}

/// Drops expired sessions and sign-in attempts.
pub fn cleanup(s: &mut Store, now: Timestamp) {
    let expired: Vec<Principal> = s.sessions.iter().filter(|e| e.value().0.expires_at <= now).map(|e| *e.key()).collect();
    for p in expired {
        s.sessions.remove(&p);
    }
    let stale: Vec<Principal> = s.pending_auth.iter().filter(|e| e.value().0.expires_at <= now).map(|e| *e.key()).collect();
    for p in stale {
        s.pending_auth.remove(&p);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_dates() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso8601(1_791_633_365 * SECOND), "2026-10-10T11:56:05Z");
        assert_eq!(iso8601(951_782_400 * SECOND), "2000-02-29T00:00:00Z");
    }
}
