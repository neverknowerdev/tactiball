# Deploying TactiBall v2 to the Internet Computer

This guide takes you from a clean machine to a production deployment on ICP mainnet.
Do the steps in order: local first, then staging, then production.

Everything runs as two canisters:

- **backend**: the Rust canister in `crates/backend`. It holds all game state: users, sessions, teams, games, ELO and the sync outbox.
- **frontend**: an asset canister serving `frontend/out`, the v1 Next.js app exported as static files. Players open this web app. It runs the same Rust game engine in the browser, compiled to WASM, to plan moves.

Players sign in with an EVM wallet on Base or Robinhood Chain, or with email and password. With a wallet, they sign a text message and the canister checks the signature; no gas or transaction is needed. One account can have both.

## 1. Install the tools (once)

| Tool | Install |
| --- | --- |
| Rust (stable) + wasm target | `curl https://sh.rustup.rs -sSf \| sh` then `rustup target add wasm32-unknown-unknown` |
| Node.js 20+ | https://nodejs.org or `nvm install 22` |
| icp-cli + ic-wasm | `npm i -g @icp-sdk/icp-cli @icp-sdk/ic-wasm` |
| wasm-bindgen CLI (engine for the browser) | `cargo install wasm-bindgen-cli --version 0.2.129 --locked` (the version must match `crates/engine-wasm/Cargo.toml`) |

Check that it worked: `icp --version`, `cargo --version`, `node --version`, `wasm-bindgen --version`.

icp-cli is DFINITY's successor to `dfx`. `v2/icp.yaml` is its project file. Docs are at https://cli.internetcomputer.org.

## 2. Run it locally

```bash
cd v2
./scripts/deploy-local.sh          # add --fresh to wipe local state
```

The script does the following:

1. Starts a local ICP network.
2. Runs the Rust tests.
3. Builds and deploys both canisters.
4. Prints the app URL, which looks like `http://<frontend-id>.localhost:8000/`.

Open that URL in a browser. Either connect MetaMask, Rabby, or Coinbase Wallet in EOA mode (your wallet signs one message to sign in), or press **Sign up with email**. Then create a team. Then open a second browser profile with another wallet or email, press **Play Now** in both, and play a match against yourself.

To exercise the whole backend without a browser, run the bot smoke test. One bot signs in with a wallet and the other signs up with email; they get paired, play turns, and then one side gives up:

```bash
npm --prefix frontend run bindings
node frontend/scripts/smoke.mjs --host http://localhost:8000 --canister $(icp canister status backend -e local --id-only)
```

## 3. Create a deploy identity and fund it with cycles

Canisters on mainnet pay for compute and storage in **cycles**. You buy cycles by converting ICP.

```bash
icp identity new tactiball-deployer        # prints a seed phrase: store it offline, it is the only backup
icp identity default tactiball-deployer
icp identity principal                     # your controller principal
icp identity account-id                    # send ICP here (from an exchange or the NNS app)
icp token balance                          # wait until the ICP arrives
icp cycles mint --cycles 6t                # converts the needed ICP into cycles
icp cycles balance -n ic
```

How many cycles you need:

- A canister is created with about **2T cycles** (around $2.70), and the cycles that are left stay in the canister as its balance.
- One environment has two canisters, so creating it costs about **4T**. Keep another 1–2T as top-up headroom.
- A full staging plus production setup needs roughly **10–12T** to start. At the time of writing, 1T cycles costs about 1.35 USD, so that is about 15 USD.
- At PoC traffic the running cost is cents per day. The backend's freezing threshold is 90 days in production, which keeps it from being deleted if the balance runs low.

## 4. Deploy staging (ICP mainnet, wallet testnets)

Staging is a real mainnet deployment, but sign-in only accepts **Base Sepolia (84532)** and **Robinhood Chain Testnet (46630)**. Use it to test with real wallets before production.

```bash
./scripts/deploy-ic.sh staging
```

The first run creates the canisters and saves their ids in `v2/.icp/data/mappings/staging.ids.json`. **Commit that file.** Canister ids are public, and it is how later deploys, from any machine, find the same canisters instead of creating new ones. Later runs upgrade the canisters in place and keep all state.

The script ends by allowing sign-in only from the frontend's own `https://<id>.icp0.io` host, and it prints that URL.

Check that the deploy worked:

```bash
icp canister call backend health '()' -e staging --query
node frontend/scripts/smoke.mjs --host https://icp-api.io \
  --canister $(icp canister status backend -e staging --id-only) \
  --domain $(icp canister status frontend -e staging --id-only).icp0.io
```

## 5. Deploy production

Production signs in with **Base (8453)** and **Robinhood Chain (4663)** mainnet wallets.

```bash
./scripts/deploy-ic.sh production                              # asks you to type "yes"
./scripts/deploy-ic.sh production --domain play.tactiball.xyz  # same, plus a custom domain
```

Then do these follow-ups.

1. **Add a backup controller.** If you lose the deploy identity, you can no longer upgrade or top up the canisters. Add a second principal, such as a hardware wallet or a teammate's identity:
   ```bash
   icp canister settings update backend --add-controller <principal> -e production
   icp canister settings update frontend --add-controller <principal> -e production
   ```
2. **Admins.** Controllers are admins automatically. To let another principal change settings without making it a controller, run:
   ```bash
   icp canister call backend admin_update_settings '(record { admins = opt vec { principal "<principal>" } })' -e production
   ```

### Custom domain

`--domain` writes `frontend/public/.well-known/ic-domains` into the deployed app and allows sign-in from that host. To make the domain resolve, follow these steps.

1. Add DNS records at your DNS provider:

   | Type | Name | Value |
   | --- | --- | --- |
   | CNAME | `play.tactiball.xyz` | `play.tactiball.xyz.icp1.io` |
   | TXT | `_canister-id.play.tactiball.xyz` | `<frontend canister id>` |
   | CNAME | `_acme-challenge.play.tactiball.xyz` | `_acme-challenge.play.tactiball.xyz.icp2.io` |

   A root domain (no subdomain) needs a provider that supports CNAME flattening or ALIAS records.

2. Register the domain with the boundary nodes, then check its status:
   ```bash
   curl -sL -X POST https://icp0.io/custom-domains/v1/play.tactiball.xyz/validate
   curl -sL -X POST https://icp0.io/custom-domains/v1/play.tactiball.xyz
   curl -sL https://icp0.io/custom-domains/v1/play.tactiball.xyz      # wait for "registered"
   ```
   The current procedure is documented at https://internetcomputer.org/docs/building-apps/frontends/custom-domains/using-custom-domains. Follow that page if it differs from these steps.

## 6. Letting Claude deploy

Claude runs in a cloud container that starts fresh each session, so it needs three things from you. Never paste a key into the chat.

1. **Its own deploy identity**, made on your machine:
   ```bash
   icp identity new claude-deployer --storage plaintext   # store the seed phrase offline
   icp identity principal --identity claude-deployer      # Claude's principal
   icp identity export claude-deployer                    # the PEM, for step 2
   ```
2. **A cloud environment** for the project: [Project settings](#project-settings/environment) → Cloud environment → Add cloud environment.
   - Add the PEM as the secret `ICP_DEPLOYER_PEM`. `deploy-ic.sh` imports it as the `tactiball-ci` identity.
   - Allow the hosts `icp-api.io`, `icp0.io` and `ic0.app`, and keep package managers allowed.
3. **Control of the canisters.** Either works:
   - Recommended: you create the canisters with your own identity (step 4 above) and add Claude as a controller. Upgrades are paid from the canister's own cycles, so Claude's identity needs no cycles.
     ```bash
     icp canister settings update backend  --add-controller <claude principal> -e staging
     icp canister settings update frontend --add-controller <claude principal> -e staging
     ```
   - Or send cycles to Claude's identity and let it create the canisters itself, then add your own principal as a controller.

You can take access back at any time with `--remove-controller <claude principal>`. To keep production in your own hands, add Claude as a controller of staging only; Claude then prepares a release, and you run `./scripts/deploy-ic.sh production`.

No chain keys or RPC keys are needed today. Wallet sign-in only checks signatures, and the home-chain sync is a stub. When the sync is built, the canister will sign its own transactions with ICP threshold ECDSA, so there is still no private key to hand over.

## 7. Upgrading the canisters

Shipping a new version is the same command as the first deploy: `./scripts/deploy-ic.sh <env>`. It finds the canisters through `.icp/data/mappings/`, builds, and upgrades them in place.

- Only a controller can upgrade. Keep at least two: your own identity plus a backup such as a hardware wallet, and Claude's if it deploys.
- All data is in stable memory, so it survives upgrades. The timers are started again in `post_upgrade`, and the only init argument it re-applies is the `chains` list from `icp.yaml`.
- When a stored type changes, add only optional fields, and never reuse a stable `MemoryId`. That keeps old data decoding.
- Test each release on staging first. Before a risky production upgrade, take a snapshot, which you can restore if the upgrade goes wrong:
  ```bash
  icp canister stop backend -e production
  icp canister snapshot create backend -e production
  icp canister start backend -e production
  # if needed: icp canister snapshot restore backend <snapshot id> -e production
  ```

## 8. Day-to-day operations

| Task | Command |
| --- | --- |
| Ship a new version | `./scripts/deploy-ic.sh production` (upgrades in place, state is kept) |
| Health and counters | `icp canister call backend health '()' -e production --query` |
| Cycles left | `icp canister status backend -e production` |
| Top up | `icp canister top-up backend --amount 1T -e production` |
| Current settings | `icp canister call backend get_settings -e production --query` |
| Change a setting | `icp canister call backend admin_update_settings '(record { default_session_ttl_secs = opt (604800 : nat64) })' -e production` |
| Turn a chain off | `admin_update_settings` with the full `chains` list, using `enabled = false` for that chain |
| Pending chain sync | `icp canister call backend sync_overview -e production --query` |

Settings live in canister state. `init_args` in `icp.yaml` is re-applied on every upgrade, but it only sets the fields it lists (`chains`). Changes made with `admin_update_settings`, such as allowed domains, admins and session length, survive upgrades.

Before upgrading production, test the same build on staging. Stable memory keeps all data across upgrades. If you change a stored type, add only optional fields.

## 9. What this PoC does not do yet

- **Emails are not verified, and there is no password reset.** The canister would need an HTTPS outcall to a mail provider to send a confirmation or reset link. Until then, anyone can register an address they don't own, and a forgotten password can't be recovered. A signed-in player can change their password with `auth_change_password`.
- **EOA wallets only.** Smart wallets (Coinbase Smart Wallet, Safe) sign with EIP-1271/6492, which the canister cannot check yet, so those users see an "invalid signature" error.
- **Home-chain ledger is a stub.** Finished games are queued per chain in an outbox (`sync_overview`), but nothing is written onchain yet.
- **The Farcaster / Base App mini-app frame is not wired.** The v1 `/.well-known/farcaster.json` route and the Zealy pages needed a server, so they are not in the static export. The app still loads inside the Base App, but that app's smart wallet can't sign in yet (see above).
- **Live updates use polling.** The lobby is polled every 3 s and a running game every 1.5 s. These are query calls, so they are cheap.
- **Robinhood Chain RPC URLs** in `frontend/lib/chains.ts` are only used when a wallet needs to add the chain. Check them, or set `NEXT_PUBLIC_ROBINHOOD_RPC_URL` and `NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL` at build time.
- **No certified queries.** Query answers such as the leaderboard and game views are trusted from one replica. Update calls such as moves and sign-in go through consensus.
- **The leaderboard scans all teams** on each call. That is fine for thousands of teams; at larger scale it needs a sorted index.
- **World ID is hooks only.** Verification records and a per-mode policy exist, but every mode is set to off.
- **Not deployed to ICP mainnet yet.** It has run on a local replica (`deploy-local.sh` and the bot smoke test), but staging and production have never been deployed, so the first `deploy-ic.sh staging` is its first mainnet run.
