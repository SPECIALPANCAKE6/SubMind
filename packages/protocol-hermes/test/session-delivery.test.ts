import { describe, expect, it } from "vitest";
import {
  createHermesSessionDeliveryAdapter,
  createNativeHermesSessionDeliveryAdapter,
  getHermesNativeDeliveryStatus,
  resolveHermesSessionId,
  saveHermesNativeDeliverySettings
} from "../src/index";

const target = {
  projectId: "project-1",
  sessionId: "session-hermes-abc_123",
  threadId: "thread-hermes-abc_123"
};
const proposal = { kind: "Task" as const, id: "task-1" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("hermes active-session delivery adapter", () => {
  it("maps SubMind session and thread IDs back to the Hermes session", () => {
    expect(resolveHermesSessionId(target)).toBe("abc_123");
    expect(() =>
      resolveHermesSessionId({ sessionId: "session-codex-1", threadId: "thread-codex-1" })
    ).toThrow(/not a Hermes session/);
    expect(() =>
      resolveHermesSessionId({ ...target, threadId: "thread-hermes-other" })
    ).toThrow(/not a Hermes session/);
  });

  it("posts the message to the native session chat endpoint with the bearer key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const adapter = createHermesSessionDeliveryAdapter({
      apiKey: "test-key",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init! });
        return jsonResponse({
          object: "hermes.session.chat.completion",
          session_id: "abc_123",
          message: { role: "assistant", content: "ok" }
        });
      }
    });

    const receipt = await adapter.deliverMessage({
      target,
      proposal,
      message: "Operator-approved SubMind task context"
    });

    expect(adapter.id).toBe("hermes-api-server");
    expect(receipt.deliveryId).toMatch(/^hermes-session-chat-/);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://127.0.0.1:8642/api/sessions/abc_123/chat");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key"
    );
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      message: "Operator-approved SubMind task context"
    });
  });

  it("reports an unknown session instead of claiming delivery", async () => {
    const adapter = createHermesSessionDeliveryAdapter({
      apiKey: "test-key",
      fetch: async () =>
        jsonResponse(
          { error: { code: "session_not_found", message: "Session not found: abc_123" } },
          404
        )
    });

    await expect(
      adapter.deliverMessage({ target, proposal, message: "hello" })
    ).rejects.toThrow(/does not know this session; nothing was delivered/);
  });

  it("reports rejected keys, unexpected bodies, and unreachable servers", async () => {
    const rejected = createHermesSessionDeliveryAdapter({
      apiKey: "bad",
      fetch: async () => jsonResponse({ error: "unauthorized" }, 401)
    });
    await expect(
      rejected.deliverMessage({ target, proposal, message: "hello" })
    ).rejects.toThrow(/rejected the API server key/);

    const unexpected = createHermesSessionDeliveryAdapter({
      apiKey: "key",
      fetch: async () => jsonResponse({ ok: true })
    });
    await expect(
      unexpected.deliverMessage({ target, proposal, message: "hello" })
    ).rejects.toThrow(/delivery is unconfirmed/);

    const unreachable = createHermesSessionDeliveryAdapter({
      apiKey: "key",
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      }
    });
    await expect(
      unreachable.deliverMessage({ target, proposal, message: "hello" })
    ).rejects.toThrow(/unreachable: ECONNREFUSED/);
  });

  it("states that a timed-out delivery has an unknown outcome", async () => {
    const adapter = createHermesSessionDeliveryAdapter({
      apiKey: "key",
      timeoutMs: 5,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    });

    await expect(
      adapter.deliverMessage({ target, proposal, message: "hello" })
    ).rejects.toThrow(/may or may not have been delivered/);
  });

  it("refuses non-Hermes targets, missing keys, and plaintext remote servers", async () => {
    const adapter = createHermesSessionDeliveryAdapter({
      apiKey: "key",
      fetch: async () => jsonResponse({})
    });
    await expect(
      adapter.deliverMessage({
        target: { projectId: "p", sessionId: "session-codex-1", threadId: "thread-codex-1" },
        proposal,
        message: "hello"
      })
    ).rejects.toThrow(/not a Hermes session/);

    expect(() => createHermesSessionDeliveryAdapter({ apiKey: " " })).toThrow(/key is required/);
    expect(() =>
      createHermesSessionDeliveryAdapter({ apiKey: "key", baseUrl: "http://example.com:8642" })
    ).toThrow(/requires https/);
    expect(() =>
      createHermesSessionDeliveryAdapter({ apiKey: "key", baseUrl: "https://user:pw@example.com" })
    ).toThrow(/must not embed credentials/);
    expect(() =>
      createHermesSessionDeliveryAdapter({ apiKey: "key", baseUrl: "https://example.com" })
    ).not.toThrow();
  });
});

describe("native hermes active-session delivery adapter", () => {
  it("delivers through the native command with only the Hermes session id and message", async () => {
    const calls: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const adapter = createNativeHermesSessionDeliveryAdapter(async <T,>(
      command: string,
      payload?: Record<string, unknown>
    ) => {
      calls.push({ command, ...(payload ? { payload } : {}) });
      return { deliveryId: "hermes-session-chat-1" } as T;
    });

    await expect(
      adapter.deliverMessage({ target, proposal, message: "Do the thing" })
    ).resolves.toEqual({ deliveryId: "hermes-session-chat-1" });
    expect(calls).toEqual([
      {
        command: "deliver_hermes_session_message",
        payload: { hermesSessionId: "abc_123", message: "Do the thing" }
      }
    ]);
  });

  it("refuses non-Hermes targets and unconfirmed native results", async () => {
    const invoke = (async () => ({})) as never;
    const adapter = createNativeHermesSessionDeliveryAdapter(invoke);
    await expect(
      adapter.deliverMessage({
        target: { ...target, sessionId: "session-codex-1", threadId: "thread-codex-1" },
        proposal,
        message: "x"
      })
    ).rejects.toThrow(/not a Hermes session/);
    await expect(
      adapter.deliverMessage({ target, proposal, message: "x" })
    ).rejects.toThrow(/not confirmed/);
  });

  it("reports an unavailable status instead of throwing", async () => {
    const failing = (async () => {
      throw new Error("no runtime");
    }) as never;
    await expect(getHermesNativeDeliveryStatus(failing)).resolves.toMatchObject({
      configured: false
    });
  });

  it("saves settings through the native command and surfaces string errors", async () => {
    const calls: Array<{ command: string; payload?: Record<string, unknown> }> = [];
    const invoke = (async (command: string, payload?: Record<string, unknown>) => {
      calls.push({ command, ...(payload ? { payload } : {}) });
      return { configured: true, keyConfigured: true, keySource: "settings" };
    }) as never;
    const status = await saveHermesNativeDeliverySettings(invoke, {
      baseUrl: "http://127.0.0.1:8642",
      allowRemote: false,
      apiKey: "secret-key"
    });
    expect(calls).toEqual([
      {
        command: "save_hermes_delivery_settings",
        payload: {
          settings: {
            baseUrl: "http://127.0.0.1:8642",
            allowRemote: false,
            apiKey: "secret-key"
          }
        }
      }
    ]);
    expect(JSON.stringify(status)).not.toContain("secret-key");

    const rejecting = (async () => {
      throw "Remote Hermes URLs must use HTTPS.";
    }) as never;
    await expect(
      saveHermesNativeDeliverySettings(rejecting, { allowRemote: true })
    ).rejects.toThrow("Remote Hermes URLs must use HTTPS.");
  });
});
