#!/usr/bin/env bash
# deploy-verify.sh — the dist→host arrow's gate.
#   pre  : assert the candidate artifact is gate-clean (before the operator deploys)
#   post : assert the serving bytes == the candidate bytes (after the operator deploys)
# The COPY ITSELF stays the operator's atomic tmp+mv — this script verifies, never copies.
set -euo pipefail
cd "$(dirname "$0")/.."
BUNDLE="dist/index.js"
HOST_PLUGIN="$HOME/.config/opencode/plugins/trident/dist/index.js"
MANIFEST=".trident/artifact-manifest.json"

pre() {
  [ -f "$MANIFEST" ] || { echo "DEPLOY GATE: no manifest — run build-verified.sh"; exit 1; }
  SHA=$(jq -r .dist_sha256 "$MANIFEST")
  ACTUAL=$(sha256sum "$BUNDLE" | cut -d' ' -f1)
  [ "$SHA" = "$ACTUAL" ] || { echo "DEPLOY GATE FAIL: manifest $SHA != on-disk $ACTUAL"; exit 1; }
  scripts/build-verified.sh --skip-build > /dev/null
  echo "DEPLOY GATE pre: PASS — candidate ${SHA:0:16} is gate-clean"
  echo "HANDOFF: the operator deploys this sha; then run: $0 post $SHA"
}

post() {
  EXPECTED="${1:-$(jq -r .dist_sha256 "$MANIFEST")}"
  [ -f "$HOST_PLUGIN" ] || { echo "DEPLOY GATE FAIL: host plugin missing"; exit 1; }
  SERVING=$(sha256sum "$HOST_PLUGIN" | cut -d' ' -f1)
  [ "$SERVING" = "$EXPECTED" ] \
    || { echo "DEPLOY GATE FAIL: serving ${SERVING:0:16} != expected ${EXPECTED:0:16}"; exit 1; }
  PID=$(pgrep -f 'agent trident' | head -1 || true)
  if [ -n "$PID" ] && [ -r "/proc/$PID/environ" ]; then
    DIAL=$(tr '\0' '\n' < "/proc/$PID/environ" | grep '^TRIDENT_V2_LEVEL=' || true)
    echo "DEPLOY GATE post: serving ${SERVING:0:16} == expected; dial: ${DIAL:-<unset: fail-closed>}"
  else
    echo "DEPLOY GATE post: serving bytes verified; env not readable (restart pending?)"
  fi
  echo "VERIFIED: the host serves the tested bytes."
}

case "${1:-}" in
  pre) pre ;;
  post) shift; post "$@" ;;
  *) echo "usage: $0 pre | post [expected_sha]"; exit 2 ;;
esac
