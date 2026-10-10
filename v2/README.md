# TactiBall v2 (Internet Computer)

All game logic runs in one Rust canister on ICP, and the web app is served from an asset canister. Wallets on Base and Robinhood Chain are only used to sign in.

```
crates/engine     game rules + ELO, ported from v1 (game.ts, Elo.sol); no IC deps
crates/backend    the canister: auth, teams, lobby, games, stats, ledger outbox (stub)
frontend          Vite + React app, deployed to the asset canister
scripts           deploy-local.sh, deploy-ic.sh <staging|production>
icp.yaml          icp-cli project: canisters and environments
DEPLOY.md         step-by-step guide to staging and production
```

## Develop

```bash
cargo test                                   # engine + canister end-to-end tests (native)
UPDATE_CANDID=1 cargo test -p tactiball_backend candid   # regenerate backend.did after API changes
./scripts/deploy-local.sh                    # local network + both canisters
npm --prefix frontend run dev                # hot-reload UI against the local backend (see frontend/.env.example)
```

## Sign-in flow

1. The browser creates an Ed25519 session key; its principal is the caller for every call.
2. `auth_prepare(address, chain_id, domain)` returns an EIP-4361 (Sign-In with Ethereum) message that names that principal.
3. The wallet signs it with `personal_sign`; `auth_login(signature)` recovers the address (secp256k1) and binds the principal to the user until the session expires (default 3 days, adjustable per user and by admins).
4. The first sign-in with a new wallet creates the user; its chain becomes the user's home chain. `auth_link` attaches more wallets.
