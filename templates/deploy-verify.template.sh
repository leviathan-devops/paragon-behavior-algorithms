#!/usr/bin/env bash
# deploy-verify.template.sh — the deploy gate (pre/post)
set -euo pipefail
PRE Sha=$(sha256sum <the dist path> | cut -d' ' -f1)
case "${1:-}" in
  pre)
    echo "pre: candidate ${PRE_SHA:0:16} — verify the manifest + the gates"
    ;;
  post)
    SERVING=$(sha256sum <the serving path> | cut -d' ' -f1)
    [ "$SERVING" = "$PRE_SHA" ] || { echo "MISMATCH: serving != expected"; exit 1; }
    echo "post: serving verified"
    ;;
esac
