import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const wrapperPath = process.argv[2];
const timeoutMs = 20_000;

if (!wrapperPath) {
  console.error("Usage: node scripts/smoke-mcp-wrapper.mjs <wrapper-path>");
  process.exit(2);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(
  scriptDir,
  "../packages/protocol-mcp/dist/node_modules/@modelcontextprotocol/sdk/dist/esm"
);
const clientModuleUrl = pathToFileURL(path.join(sdkRoot, "client/index.js"));
const stdioModuleUrl = pathToFileURL(path.join(sdkRoot, "client/stdio.js"));

const [{ Client }, { StdioClientTransport }] = await Promise.all([
  import(clientModuleUrl),
  import(stdioModuleUrl)
]);

let stderr = "";
const client = new Client({
  name: "submind-wrapper-smoke-test",
  version: "0"
});
const transport = new StdioClientTransport({
  command: wrapperPath,
  stderr: "pipe"
});

transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  await withTimeout(
    client.connect(transport),
    timeoutMs,
    "MCP wrapper initialize timed out."
  );

  const tools = await withTimeout(
    client.listTools(),
    timeoutMs,
    "MCP wrapper tools/list timed out."
  );
  const toolNames = new Set(tools.tools.map((tool) => tool.name));

  if (!toolNames.has("search_projects") || !toolNames.has("get_context_bundle")) {
    throw new Error("MCP tools/list did not expose the expected SubMind tools.");
  }

  const search = await withTimeout(
    client.callTool({
      name: "search_projects",
      arguments: {
        limit: 1
      }
    }),
    timeoutMs,
    "MCP wrapper search_projects timed out."
  );

  if (search.isError) {
    throw new Error(`MCP search_projects failed: ${JSON.stringify(search)}`);
  }

  console.log("MCP wrapper smoke test passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));

  if (stderr.trim()) {
    console.error("Wrapper stderr:");
    console.error(stderr.trim());
  }

  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}

function withTimeout(promise, milliseconds, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), milliseconds);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}
