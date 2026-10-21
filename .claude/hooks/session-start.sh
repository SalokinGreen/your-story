#!/bin/bash
# SessionStart: make the suite runnable in a remote container.
#
# A cloud container starts without node_modules, and the Vitest suite and the
# typecheck are this project's primary instruments — so without this, every
# remote session begins by hand-running `npm ci` before it can verify
# anything. This is that step, run once, automatically.
#
# Rust, Tauri, the Android SDK and Xcode are NOT installed and are not
# attempted: the native builds cannot run in the container anyway, which is
# exactly why docs/pending_tests.md exists. This hook makes the *engine*
# verifiable, which is the part a remote session can actually check.
set -euo pipefail

# Local machines manage their own installs (a fresh worktree runs `npm ci`
# itself, in the background — see the verify skill); leave them alone.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed — the suite cannot run this session."
  exit 1
fi

# Next 16 needs Node >= 20.9; Vitest 4 needs 20, 22 or >= 24.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "node $(node -v) is too old: Next 16 needs >= 20.9. The suite will not run."
  exit 1
fi

# Idempotent: the container is cached after this hook completes, so on a warm
# start node_modules is already here and current, and this is a no-op.
if [ -f node_modules/.package-lock.json ] && \
   [ node_modules/.package-lock.json -nt package-lock.json ]; then
  echo "ready: node $(node -v), node_modules current."
  exit 0
fi

echo "installing dependencies (npm ci) ..."

# Quiet on success, loud on failure. npm prints standing deprecation warnings
# that are not this session's problem; surfacing them at every session start
# would train everyone to ignore the hook's output.
INSTALL_LOG="$(mktemp)"
if npm ci --no-audit --no-fund > "$INSTALL_LOG" 2>&1; then
  echo "ready: node $(node -v), dependencies installed."
else
  echo "npm ci FAILED — the suite will not run this session:"
  cat "$INSTALL_LOG"
  rm -f "$INSTALL_LOG"
  exit 1
fi
rm -f "$INSTALL_LOG"
