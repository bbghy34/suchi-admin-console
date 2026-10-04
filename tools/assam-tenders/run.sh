#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="$SCRIPT_DIR/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  printf '%s\n' 'Set up the environment first; see tools/assam-tenders/README.md.' >&2
  exit 1
fi
exec "$PYTHON" "$SCRIPT_DIR/ingest.py" "$@"
