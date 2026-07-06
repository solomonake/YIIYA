#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  cat >&2 <<'USAGE'
Usage: bash scripts/agent-check.sh <command> [args...]

Runs a repo check with the supported Node version, periodic heartbeats, and a
hard timeout so silent builds/tests are never reported as success by accident.

Environment:
  AGENT_CHECK_TIMEOUT_SECONDS    default: 900
  AGENT_CHECK_HEARTBEAT_SECONDS  default: 30
  YIIYA_NODE_BIN                 optional directory containing node/npm
USAGE
  exit 64
fi

timeout_seconds="${AGENT_CHECK_TIMEOUT_SECONDS:-900}"
heartbeat_seconds="${AGENT_CHECK_HEARTBEAT_SECONDS:-30}"

if [ -n "${YIIYA_NODE_BIN:-}" ] && [ -x "$YIIYA_NODE_BIN/node" ]; then
  node_bin="$YIIYA_NODE_BIN"
elif [ -x "$HOME/.nvm/versions/node/v20.20.2/bin/node" ]; then
  node_bin="$HOME/.nvm/versions/node/v20.20.2/bin"
elif command -v node >/dev/null 2>&1; then
  node_bin="$(dirname "$(command -v node)")"
else
  echo "agent-check: node was not found. Install Node 20.x or 22.x." >&2
  exit 69
fi

export PATH="$node_bin:$PATH"

node_version="$(node -p 'process.versions.node')"
node_major="${node_version%%.*}"
if [ "$node_major" != "20" ] && [ "$node_major" != "22" ]; then
  echo "agent-check: refusing Node $node_version; package.json supports 20.x or 22.x." >&2
  echo "agent-check: set YIIYA_NODE_BIN to a Node 20/22 bin directory if needed." >&2
  exit 66
fi

echo "agent-check: node=$node_version bin=$node_bin"
echo "agent-check: timeout=${timeout_seconds}s heartbeat=${heartbeat_seconds}s"
echo "agent-check: command=$*"

"$@" &
cmd_pid=$!
start_seconds=$SECONDS
last_heartbeat=0

cleanup_child_tree() {
  local signal="$1"
  if command -v pkill >/dev/null 2>&1; then
    pkill "-$signal" -P "$cmd_pid" 2>/dev/null || true
  fi
  kill "-$signal" "$cmd_pid" 2>/dev/null || true
}

trap 'cleanup_child_tree TERM' INT TERM

while kill -0 "$cmd_pid" 2>/dev/null; do
  sleep 1
  elapsed=$((SECONDS - start_seconds))

  if [ "$elapsed" -ge "$timeout_seconds" ]; then
    echo "agent-check: timeout after ${elapsed}s; stopping pid $cmd_pid" >&2
    cleanup_child_tree TERM
    sleep 2
    if kill -0 "$cmd_pid" 2>/dev/null; then
      cleanup_child_tree KILL
    fi
    wait "$cmd_pid" 2>/dev/null || true
    exit 124
  fi

  if [ $((elapsed - last_heartbeat)) -ge "$heartbeat_seconds" ]; then
    echo "agent-check: still running after ${elapsed}s"
    last_heartbeat=$elapsed
  fi
done

trap - INT TERM

set +e
wait "$cmd_pid"
status=$?
set -e

elapsed=$((SECONDS - start_seconds))
echo "agent-check: finished status=$status elapsed=${elapsed}s"
exit "$status"
