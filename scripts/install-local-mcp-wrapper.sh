#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
server_path="$repo_root/packages/protocol-mcp/dist/mcp-server.js"
runtime_path="$repo_root/packages/protocol-mcp/dist/node_modules/@modelcontextprotocol/sdk"
token_file="$HOME/.config/submind/api-token"
wrapper_path="$HOME/.local/bin/submind-context-mcp"

test -s "$token_file" || {
  echo "Missing SubMind token file: $token_file" >&2
  echo "Start SubMind first; npm run desktop:tauri:dev creates it." >&2
  exit 1
}

test -f "$server_path" || {
  echo "Missing built MCP server: $server_path" >&2
  echo "Run npm run context:mcp:build first." >&2
  exit 1
}

test -d "$runtime_path" || {
  echo "Missing standalone MCP runtime: $runtime_path" >&2
  echo "Run npm run context:mcp:build first." >&2
  exit 1
}

command -v node >/dev/null || {
  echo "Missing node. Install Node in this environment for the MCP stdio process." >&2
  exit 1
}

install -d -m 700 "$HOME/.local/bin"

cat > "$wrapper_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail

SUBMIND_SERVER="$server_path"
SUBMIND_MCP_LOG="\${SUBMIND_MCP_LOG:-\$HOME/.local/state/submind/mcp-wrapper.log}"

mkdir -p "\$(dirname "\$SUBMIND_MCP_LOG")"
{
  printf '[%s] starting submind-context-mcp\n' "\$(date -Is)"
  printf 'node=%s\n' "\$(command -v node || true)"
  node --version || true
  printf 'server=%s\n' "\$SUBMIND_SERVER"
  printf 'api_url=%s\n' "http://127.0.0.1:47821"
  printf 'transport=%s\n' "default"
} < /dev/null >> "\$SUBMIND_MCP_LOG" 2>&1

export SUBMIND_API_TOKEN="\$(tr -d '\r\n' < "\$HOME/.config/submind/api-token")"
export SUBMIND_API_URL="http://127.0.0.1:47821"

exec node "\$SUBMIND_SERVER" 2>> "\$SUBMIND_MCP_LOG"
EOF

chmod 700 "$wrapper_path"

node "$repo_root/scripts/smoke-mcp-wrapper.mjs" "$wrapper_path"

echo "Installed $wrapper_path" >&2
echo "Wrapper log: $HOME/.local/state/submind/mcp-wrapper.log" >&2
