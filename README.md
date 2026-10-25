# TactiBall

A turn-based football strategy game. All game logic runs in one Rust canister on the Internet Computer, and the web app is served from an ICP asset canister. Players sign in with email and password or with a wallet on Base or Robinhood Chain.

Everything lives in [`v2/`](v2/README.md):

- [`v2/README.md`](v2/README.md): layout, development and the sign-in flow
- [`v2/DEPLOY.md`](v2/DEPLOY.md): deploying locally, to staging and to production

The v1 app (Next.js API, Supabase and the Base/World Chain contracts) was removed; it remains in the git history.
