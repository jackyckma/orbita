#!/usr/bin/env bash
# Minimal L0+L1 verification for AI agents (especially Cloud Agents).
# Customize VERIFY_L0 and VERIFY_L1 for your project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERIFY_L0="${VERIFY_L0:-pnpm typecheck}"
VERIFY_L1="${VERIFY_L1:-pnpm test}"

echo "==> agent-verify (project: $ROOT)"

if [[ -n "$VERIFY_L0" ]]; then
  echo "==> L0: $VERIFY_L0"
  eval "$VERIFY_L0"
else
  echo "WARN: VERIFY_L0 not set — add commands to scripts/agent-verify.sh or env"
fi

if [[ -n "$VERIFY_L1" ]]; then
  echo "==> L1: $VERIFY_L1"
  eval "$VERIFY_L1"
else
  echo "WARN: VERIFY_L1 not set — skipping unit tests"
fi

echo "==> agent-verify OK"
