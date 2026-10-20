import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { codexAdapter } from "../packages/protocol-codex/dist/index.js";
import { hermesAdapter } from "../packages/protocol-hermes/dist/index.js";
import { copilotAdapter } from "../packages/protocol-copilot/dist/index.js";
import { createSqliteRepository, syncRuntimeSnapshotIntoDatabase } from "../packages/store/dist/index.js";
import { createSubMindApiClient } from "../packages/protocol-mcp/dist/index.js";

// Native transport and SQLite are real. The later Hermes feed is an explicit fixture;
// this machine need not have Hermes installed, and no agent is launched.
const output = resolve(process.argv[2] ?? `artifacts/continuity-demo-${Date.now()}`);
const captured = process.argv[3];
const copilotCapture = process.argv[4];
await mkdir(output, { recursive: true });
const sdk = createRequire(resolve("packages/protocol-mcp/package.json"));
const { Client } = await import(pathToFileURL(sdk.resolve("@modelcontextprotocol/sdk/client/index.js")));
const { StdioClientTransport } = await import(pathToFileURL(sdk.resolve("@modelcontextprotocol/sdk/client/stdio.js")));
const now = Date.now();
const feed = captured ? JSON.parse(await readFile(resolve(captured), "utf8")) : {
  profileName: "Demo", threads: [{ id: "continuity-prior", title: "Keep desktop thin", cwd: "C:/demo/SubMind",
    createdAt: now / 1000 - 60, updatedAt: now / 1000, gitBranch: null, gitOriginUrl: null,
    firstUserMessage: "Keep domain logic in packages", descriptorHints: ["typescript"] }],
  events: [{ id: "prior-evidence", threadId: "continuity-prior", timestamp: new Date(now).toISOString(),
    type: "agent_message", summary: "Domain logic belongs in packages; desktop wires the host.", metadata: {} }], fileChanges: []
};
const normalized = codexAdapter.normalize(feed);
const projectName = process.argv[5] ?? "submind";
const project = normalized.projects.find(p => p.name.toLowerCase() === projectName.toLowerCase()) ?? normalized.projects[0];
assert(project, "Codex capture must contain a project");
let prior = Object.fromEntries(Object.entries(normalized).map(([key, items]) => [key,
  key === "profiles" ? items : key === "projects" ? [project] : items.filter(item => item.projectId === project.id)]));
let later = hermesAdapter.normalize({ profileName: "Demo", threads: [{ id: "continuity-later-fixture",
  title: "Continue work with retained context", workspacePath: project.workspacePath, createdAt: now, updatedAt: now,
  latestUserMessage: "What architecture constraints apply?", modelName: null, modelId: null, descriptorHints: [],
  turns: [{ id: "later-question", timestamp: now, prompt: "What architecture constraints apply?", response: null,
    modelId: null, toolNames: [], referencedFiles: [], fileChanges: [] }]
}] });
let priorHarness = "codex";
let laterHarness = "hermes";
if (copilotCapture) {
  const observed = copilotAdapter.normalize(JSON.parse(await readFile(resolve(copilotCapture), "utf8")));
  const matching = observed.projects.find(p => p.id === project.id);
  assert(matching, "Real captures must resolve to the same project without invented aliases");
  const earlier = Object.fromEntries(Object.entries(observed).map(([key, items]) => [key,
    key === "profiles" ? items : key === "projects" ? [matching] : items.filter(item => item.projectId === project.id)]));
  assert(earlier.events.some(e => e.eventType.includes("message")), "Prior capture must contain actual conversation evidence");
  const cutoff = Math.max(...earlier.events.map(e => Date.parse(e.timestamp)));
  const target = prior.threads.find(t => Date.parse(t.createdAt) > cutoff);
  assert(target, "Later task must start after the prior observed work");
  later = prior;
  later.threads = [target, ...later.threads.filter(t => t.id !== target.id)];
  prior = earlier;
  priorHarness = "copilot";
  laterHarness = "codex";
}
const dbPath = resolve(output, "continuity.db");
const raw = new DatabaseSync(dbPath);
const bind = (values = []) => Object.fromEntries(values.map((v, i) => [String(i + 1), v]));
const db = {
  async select(sql, values) { return raw.prepare(sql).all(bind(values)); },
  async execute(sql, values) { const r = raw.prepare(sql).run(bind(values)); return { rowsAffected: Number(r.changes) }; }
};
await syncRuntimeSnapshotIntoDatabase(db, prior);
await syncRuntimeSnapshotIntoDatabase(db, later);
const repo = createSqliteRepository({ db });
const snapshot = await repo.getSnapshot();
assert.equal(snapshot.projects.length, 1);
assert(snapshot.events.some(e => e.metadata.harnessId === "codex"));
assert(snapshot.events.some(e => e.metadata.harnessId === priorHarness));
assert(snapshot.events.some(e => e.metadata.harnessId === laterHarness));
const token = randomBytes(32).toString("hex");
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise(resolveClose => portProbe.close(resolveClose));
const baseUrl = `http://127.0.0.1:${port}`;
const native = spawn(resolve("packages/runtime-native/target/debug/submind-runtime.exe"), ["serve", dbPath], {
  windowsHide: true, stdio: ["ignore", "ignore", "pipe"],
  env: { ...process.env, SUBMIND_API_TOKEN: token, SUBMIND_API_PORT: String(port), SUBMIND_DB_PATH: dbPath,
    SUBMIND_CONTEXT_MODEL_URL: "" }
});
let nativeError = "";
native.stderr.on("data", chunk => { nativeError += chunk; });
const api = createSubMindApiClient({ baseUrl, token });
const client = new Client({ name: "submind-continuity-demonstration", version: "1.0" });
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${baseUrl}/v1/health`, { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert(ready, `Native API failed to start: ${nativeError}`);
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [resolve("packages/protocol-mcp/dist/mcp-server.js")],
    env: { ...process.env, SUBMIND_API_TOKEN: token, SUBMIND_API_URL: baseUrl, SUBMIND_API_TRANSPORT: "fetch" },
    stderr: "pipe"
  }));
  const request = { projectId: project.id, threadId: later.threads[0].id,
    prompt: `${project.name} architecture constraints shared context memory`, kinds: ["memory"], maxItems: 20, maxTokens: 4000 };
  const response = await client.callTool({ name: "get_context_bundle", arguments: { ...request, consumerHarnessId: laterHarness } });
  assert(!response.isError, "MCP context request failed");
  const bundle = JSON.parse(response.content.find(c => c.type === "text").text);
  const priorIds = new Set(prior.events.map(e => e.id));
  assert(bundle.items.some(item => item.sources.some(source => source.entityType === "Event" && priorIds.has(source.entityId))), "Context must include prior harness evidence");
  assert.equal(bundle.delivery.transport, "mcp");
  assert.equal(bundle.delivery.consumption, "unverified");
  const second = await api.getContextBundle({ ...request, consumerHarnessId: "codex", transport: "context_api" });
  assert(second.estimatedTokens <= 4000);
  // Refresh again after the API's audit writes; both responses must survive.
  await syncRuntimeSnapshotIntoDatabase(db, later);
  const retained = await repo.getSnapshot();
  assert(retained.events.some(e => e.id === bundle.auditEventId));
  assert(retained.events.some(e => e.id === second.auditEventId));
  assert.equal(raw.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  const eventIds = new Set(retained.events.map(event => event.id));
  const fileIds = new Set(retained.fileChanges.map(change => change.id));
  assert(retained.memory.every(memory => memory.sourceEventIds.every(id => eventIds.has(id)) && memory.sourceFileChangeIds.every(id => fileIds.has(id))), "Retained memory evidence must resolve");
  const report = {
    sqliteIntegrity: "ok",
    memoryEvidenceReferences: "all resolve",
    observedSource: copilotCapture ? "real local Copilot Insiders history" : captured ? "real local Codex history" : "Codex fixture",
    laterSource: copilotCapture ? "real later Codex task; context requested by demonstration client" : "Hermes adapter fixture; no Hermes process launched",
    transport: "real authenticated native HTTP API and MCP stdio process",
    projectCount: retained.projects.length, retainedThreads: retained.threads.length,
    retainedEvents: retained.events.length, retainedMemories: retained.memory.length,
    contextItems: bundle.items.length, estimatedTokens: bundle.estimatedTokens,
    auditEventsRetained: [bundle.auditEventId, second.auditEventId],
    verified: ["cross-adapter project identity", "prior evidence retrieval", "native API/MCP supply", "durable audit after refresh"],
    limitations: ["consumer harness IDs are self-reported", "delivery exercised by demonstration client, not a live coding agent", "model consumption and usefulness unverified", "outcome correlation tested separately with fixtures"]
  };
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
  const stopped = once(native, "exit");
  if (native.exitCode === null) {
    native.kill();
    await Promise.race([stopped, new Promise((_, reject) => setTimeout(() => reject(new Error(`Demo API process ${native.pid} did not stop`)), 5000))]);
  }
  raw.close();
}
