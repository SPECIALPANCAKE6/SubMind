#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
server_path="$repo_root/packages/protocol-mcp/dist/mcp-server.js"
runtime_path="$repo_root/packages/protocol-mcp/dist/node_modules/@modelcontextprotocol/sdk"
wrapper_path="$HOME/.local/bin/submind-context-mcp"
windows_profile="$(cmd.exe /C 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r\n')"
token_file="$(wslpath "$windows_profile")/.config/submind/api-token"

test -s "$token_file" || {
  echo "Missing shared Windows token file: $token_file" >&2
  echo "Start SubMind from Windows first; npm run desktop:tauri:dev creates it." >&2
  exit 1
}

test -f "$server_path" || {
  echo "Missing built MCP server: $server_path" >&2
  echo "Run npm run context:mcp:build from Git Bash or another Windows shell first." >&2
  exit 1
}

test -d "$runtime_path" || {
  echo "Missing standalone MCP runtime: $runtime_path" >&2
  echo "Run npm run context:mcp:build from Git Bash or another Windows shell first." >&2
  exit 1
}

command -v node >/dev/null || {
  echo "Missing WSL node. Install Node in WSL for the MCP stdio process." >&2
  exit 1
}

test -x /mnt/c/Windows/System32/curl.exe || {
  echo "Missing Windows curl.exe at /mnt/c/Windows/System32/curl.exe" >&2
  exit 1
}

install -d -m 700 "$HOME/.local/bin"
server_path_quoted="$(printf '%q' "$server_path")"
token_file_quoted="$(printf '%q' "$token_file")"

cat > "$wrapper_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail

SHARED_TOKEN_FILE=$token_file_quoted
SUBMIND_SERVER=$server_path_quoted
SUBMIND_MCP_LOG="\${SUBMIND_MCP_LOG:-\$HOME/.local/state/submind/mcp-wrapper.log}"

mkdir -p "\$(dirname "\$SUBMIND_MCP_LOG")"
{
  printf '[%s] starting submind-context-mcp\n' "\$(date -Is)"
  printf 'node=%s\n' "\$(command -v node || true)"
  node --version || true
  printf 'server=%s\n' "\$SUBMIND_SERVER"
  printf 'api_url=%s\n' "http://127.0.0.1:47821"
  printf 'transport=%s\n' "windows-curl"
} < /dev/null >> "\$SUBMIND_MCP_LOG" 2>&1

test -s "\$SHARED_TOKEN_FILE" || {
  echo "Missing shared Windows token file: \$SHARED_TOKEN_FILE" >> "\$SUBMIND_MCP_LOG"
  exit 1
}

export SUBMIND_API_TOKEN="\$(tr -d '\r\n' < "\$SHARED_TOKEN_FILE")"
export SUBMIND_API_URL="http://127.0.0.1:47821"
export SUBMIND_API_TRANSPORT="windows-curl"
export SUBMIND_WINDOWS_CURL="\${SUBMIND_WINDOWS_CURL:-/mnt/c/Windows/System32/curl.exe}"

exec node "\$SUBMIND_SERVER" 2>> "\$SUBMIND_MCP_LOG"
EOF

chmod 700 "$wrapper_path"

node "$repo_root/scripts/smoke-mcp-wrapper.mjs" "$wrapper_path"

echo "Installed $wrapper_path" >&2
echo "Wrapper log: $HOME/.local/state/submind/mcp-wrapper.log" >&2
