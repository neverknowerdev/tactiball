# TactiBall v2 frontend

The v1 Next.js app, exported as static files (`out/`) and served by the ICP
asset canister. It has no server of its own:

- **Data and game logic**: the backend canister (`lib/backend.ts`, bindings
  generated from `crates/backend/backend.did` into `lib/bindings/`).
- **Move planning**: the Rust engine compiled to WASM (`lib/engine/`, built
  by `../scripts/build-engine-wasm.sh` into `lib/engine/pkg/`). It is the same
  code the canister uses to validate moves.
- **Sign-in**: wagmi + OnchainKit wallet button. The wallet signs one
  Sign-In with Ethereum message on Base or Robinhood Chain (`app/session.tsx`);
  after that a browser session key signs canister calls.
- **Live updates**: polling (`lobby` every 3 s, the game every 1.5 s) instead
  of Ably.

```bash
npm ci
npm run build          # engine WASM + bindings + next build -> out/
cp env.example .env.local && npm run dev   # against a local network (see env.example)
```

`npm run build` needs Rust with the `wasm32-unknown-unknown` target and
`wasm-bindgen-cli` (see `../DEPLOY.md`).

Pages: `/` (team, quick match, invites, stats, leaderboard), `/game/?id=N`,
`/rules-of-game/`.
