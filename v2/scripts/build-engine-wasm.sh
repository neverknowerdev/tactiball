#!/usr/bin/env bash
# Builds the Rust game engine for the browser into frontend/lib/engine/pkg.
# Needs: rustup target add wasm32-unknown-unknown
#        cargo install wasm-bindgen-cli --version 0.2.129 --locked
set -euo pipefail
cd "$(dirname "$0")/.."

WANT=$(sed -n 's/^wasm-bindgen = "=\(.*\)"/\1/p' crates/engine-wasm/Cargo.toml)
command -v wasm-bindgen >/dev/null || { echo "wasm-bindgen CLI missing: cargo install wasm-bindgen-cli --version $WANT --locked" >&2; exit 1; }
HAVE=$(wasm-bindgen --version | awk '{print $2}')
[[ "$HAVE" == "$WANT" ]] || { echo "wasm-bindgen CLI is $HAVE, the crate needs $WANT: cargo install wasm-bindgen-cli --version $WANT --locked --force" >&2; exit 1; }

cargo build -p tactiball_engine_wasm --target wasm32-unknown-unknown --release --locked
wasm-bindgen target/wasm32-unknown-unknown/release/tactiball_engine_wasm.wasm \
  --target web --out-dir frontend/lib/engine/pkg --out-name engine
echo "Engine WASM: $(du -h frontend/lib/engine/pkg/engine_bg.wasm | cut -f1)"
