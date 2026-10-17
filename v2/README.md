# TactiBall v2 (Internet Computer)

All game logic runs in one Rust canister on ICP, and the web app is served from an asset canister. Players sign in with a wallet on Base or Robinhood Chain, or with email and password; wallets are only used to sign in.

```
crates/engine       game rules + ELO, ported from v1 (game.ts, Elo.sol); no IC deps
crates/engine-wasm  the engine for the browser (wasm-bindgen): move planning in the UI
crates/backend      the canister: auth, teams, lobby, games, stats, ledger outbox (stub)
frontend            the v1 Next.js app as a static export, deployed to the asset canister
scripts            deploy-local.sh, deploy-ic.sh <staging|production>, build-engine-wasm.sh
icp.yaml           icp-cli project: canisters and environments
DEPLOY.md          step-by-step guide to staging and production
```

## Develop

```bash
cargo test                                   # engine + canister end-to-end tests (native)
UPDATE_CANDID=1 cargo test -p tactiball_backend candid   # regenerate backend.did after API changes
./scripts/deploy-local.sh                    # local network + both canisters
npm --prefix frontend run dev                # hot-reload UI against the local backend (see frontend/env.example)
```

## Sign-in flow

1. The browser creates an Ed25519 session key; its principal is the caller for every call.
2. `auth_prepare(address, chain_id, domain)` returns an EIP-4361 (Sign-In with Ethereum) message that names that principal.
3. The wallet signs it with `personal_sign`; `auth_login(signature)` recovers the address (secp256k1) and binds the principal to the user until the session expires (default 3 days, adjustable per user and by admins).
4. The first sign-in with a new wallet creates the user; its chain becomes the user's home chain. `auth_link` attaches more wallets.

Email accounts use the same session key:

1. The browser derives `password_key` = PBKDF2-SHA256(password, `"tactiball:" + email`, 210 000 rounds), so the password itself never leaves the page.
2. `auth_email_sign_up({ email, password_key })` creates the user, and `auth_email_login` signs in. Both bind the session principal like `auth_login`. The canister stores only PBKDF2(password_key, random salt), and locks an address for 15 minutes after 5 wrong passwords.
3. One account can have both kinds of sign-in. `auth_link_email` adds an email to a wallet account, and `auth_link` adds a wallet to an email account; that wallet's chain then becomes the account's home chain. `auth_change_password` changes the password.

Email accounts have no home chain until they link a wallet, so their games are not queued for any chain ledger.
