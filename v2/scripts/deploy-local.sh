#!/usr/bin/env bash
# Deploys backend + frontend to a local ICP network (PocketIC via icp-cli).
# Usage: ./scripts/deploy-local.sh [--fresh]
#   --fresh  stop the local network first, so all state is wiped
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/common.sh
require_tools

if [[ "${1:-}" == "--fresh" ]]; then
  icp network stop >/dev/null 2>&1 || true
fi
if ! icp network ping >/dev/null 2>&1; then
  echo "Starting local network..."
  icp network start -d
fi

echo "Running backend tests..."
cargo test --quiet

echo "Deploying..."
icp deploy -e local -y

FRONTEND=$(canister_id frontend local)
BACKEND=$(canister_id backend local)
cat <<MSG

Local deployment ready.
  App:      http://${FRONTEND}.localhost:8000/
  Backend:  ${BACKEND}   (icp canister call backend health '()' -e local --query)

Sign-in accepts any domain locally. To use the Next.js dev server instead:
  printf 'NEXT_PUBLIC_BACKEND_CANISTER_ID=%s\nNEXT_PUBLIC_IC_HOST=http://localhost:8000\n' "${BACKEND}" > frontend/.env.local
  npm --prefix frontend run dev   # http://localhost:3001
Smoke test (two bot wallets play a short game):
  npm --prefix frontend run bindings && node frontend/scripts/smoke.mjs --host http://localhost:8000 --canister ${BACKEND}
MSG
