#!/usr/bin/env bash
# Render docs/site/*.md into apps/orbita-web/public/docs/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/orbita-web"

echo "==> building public docs from docs/site/"
node "$ROOT/scripts/build-web-docs.mjs"
