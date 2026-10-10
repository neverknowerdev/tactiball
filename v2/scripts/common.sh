# Shared helpers for the deploy scripts. Sourced, not executed.

die() { echo "error: $*" >&2; exit 1; }

require_tools() {
  command -v icp >/dev/null || die "icp-cli not found. Install: npm i -g @icp-sdk/icp-cli @icp-sdk/ic-wasm"
  command -v ic-wasm >/dev/null || die "ic-wasm not found. Install: npm i -g @icp-sdk/ic-wasm"
  command -v cargo >/dev/null || die "Rust not found. Install from https://rustup.rs"
  rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown \
    || die "missing Rust target. Run: rustup target add wasm32-unknown-unknown"
  command -v npm >/dev/null || die "Node.js/npm not found (Node 20+)"
}

canister_id() { # name env
  icp canister status "$1" -e "$2" --id-only 2>/dev/null | tail -n1 | tr -d '[:space:]'
}

# Candid `opt vec text` from arguments.
candid_text_vec() {
  local out="vec {"
  for d in "$@"; do out+=" \"$d\";"; done
  echo "$out }"
}
