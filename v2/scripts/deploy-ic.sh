#!/usr/bin/env bash
# Deploys to ICP mainnet.
# Usage: ./scripts/deploy-ic.sh <staging|production> [--domain play.example.com]... [--yes]
#
# staging     signs in with Base Sepolia + Robinhood testnet wallets
# production  signs in with Base + Robinhood Chain mainnet wallets
#
# Needs an icp-cli identity with cycles (see v2/DEPLOY.md). The first deploy
# creates the canisters (2T cycles each by default); later runs upgrade them
# and keep all state.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/common.sh

ENV="${1:-}"
[[ "$ENV" == "staging" || "$ENV" == "production" ]] || die "usage: $0 <staging|production> [--domain host]... [--yes]"
shift
DOMAINS=()
YES=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAINS+=("$2"); shift 2 ;;
    --yes|-y) YES=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_tools
echo "Identity:  $(icp identity default) ($(icp identity principal))"
echo "Cycles:    $(icp cycles balance -n ic 2>/dev/null || echo 'unknown')"
echo "Target:    $ENV on ICP mainnet"

if [[ "$ENV" == "production" && "$YES" != 1 ]]; then
  read -r -p "Deploy to PRODUCTION? Type 'yes' to continue: " answer
  [[ "$answer" == "yes" ]] || die "aborted"
fi

echo "Running backend tests..."
cargo test --quiet

# Custom domains are served by the asset canister once it lists them in
# /.well-known/ic-domains (DNS and registration steps are in DEPLOY.md).
if [[ ${#DOMAINS[@]} -gt 0 ]]; then
  mkdir -p frontend/public/.well-known
  printf '%s\n' "${DOMAINS[@]}" > frontend/public/.well-known/ic-domains
  echo "Wrote frontend/public/.well-known/ic-domains: ${DOMAINS[*]}"
fi

icp deploy -e "$ENV" $([[ "$YES" == 1 ]] && echo -y)

FRONTEND=$(canister_id frontend "$ENV")
BACKEND=$(canister_id backend "$ENV")
[[ -n "$FRONTEND" && -n "$BACKEND" ]] || die "could not read canister ids for $ENV"

# Only these hosts may appear in a sign-in message.
ALLOWED=("${FRONTEND}.icp0.io" "${FRONTEND}.ic0.app" ${DOMAINS[@]+"${DOMAINS[@]}"})
echo "Allowing sign-in from: ${ALLOWED[*]}"
icp canister call backend admin_update_settings \
  "(record { allowed_domains = opt $(candid_text_vec "${ALLOWED[@]}") })" -e "$ENV" >/dev/null

cat <<MSG

Deployed $ENV.
  App:      https://${FRONTEND}.icp0.io/
  Backend:  ${BACKEND}
$(for d in ${DOMAINS[@]+"${DOMAINS[@]}"}; do echo "  Domain:   https://$d/ (after DNS + registration, see DEPLOY.md)"; done)
Check:      icp canister call backend health '()' -e $ENV --query
Top up:     icp canister top-up backend --amount 1T -e $ENV
MSG
