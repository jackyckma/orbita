#!/usr/bin/env bash
# Verify tickets feature flag is enabled before running ticket runtime checks.
#
# Usage:
#   ./scripts/tickets-verify-flag-off.sh
#
# Exits 0 when ORBITA_TICKETS_ENABLED=1; otherwise exits 1 with a clear message.
set -euo pipefail

if [[ "${ORBITA_TICKETS_ENABLED:-}" == "1" ]]; then
  echo "ok: ORBITA_TICKETS_ENABLED=1 (tickets DDL/routes may be active)"
  exit 0
fi

echo "error: ORBITA_TICKETS_ENABLED is not set to 1 (tickets remain off by default)." >&2
echo "  Production enable is founder-only (decision D-005): set the env on the API service after e2e-tier-a is green with the flag on." >&2
echo "  This script is for operators verifying the flag before ticket verify steps — not a substitute for CI." >&2
exit 1
