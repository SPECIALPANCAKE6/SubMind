import type { ActiveSessionDeliveryAdapter } from "@submind/core";

const hermesSessionPrefix = "session-hermes-";
const hermesThreadPrefix = "thread-hermes-";
const defaultTimeoutMs = 120_000;
const maximumErrorLength = 300;

export const hermesApiServerDefaultBaseUrl = "http://127.0.0.1:8642";

export interface HermesSessionDeliveryOptions {
  /** Hermes API server origin; defaults to the local gateway. */
  baseUrl?: string;
  /** `API_SERVER_KEY` of the Hermes gateway. Never persisted or logged here. */
  apiKey: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

function resolveBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("The Hermes API server URL is not valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The Hermes API server URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("The Hermes API server URL must not embed credentials.");
  }
  // The bearer key and message content must not cross a network in plaintext.
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new Error("A non-loopback Hermes API server requires https.");
  }
  return url;
}

/** Maps SubMind's Hermes-normalized IDs back to the Hermes session ID. */
export function resolveHermesSessionId(target: {
  sessionId: string;
  threadId: string;
}): string {
  const hermesId = target.sessionId.startsWith(hermesSessionPrefix)
    ? target.sessionId.slice(hermesSessionPrefix.length)
    : "";
  if (
    !hermesId ||
    target.threadId !== `${hermesThreadPrefix}${hermesId}` ||
    !/^[\x21-\x7e]{1,255}$/.test(hermesId)
  ) {
    throw new Error("The target is not a Hermes session and thread.");
  }
  return hermesId;
}

function describeFailure(status: number, body: unknown): string {
  const error =
    typeof body === "object" && body !== null
      ? (body as { error?: unknown }).error
      : undefined;
  const code =
    typeof error === "object" && error !== null
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  if (status === 404 && code === "session_not_found") {
    return "Hermes does not know this session; nothing was delivered.";
  }
  if (status === 401 || status === 403) {
    return "Hermes rejected the API server key.";
  }
  const detail = [code, message].filter(Boolean).join(": ").slice(0, maximumErrorLength);
  return `Hermes API server responded with HTTP ${status}${detail ? ` (${detail})` : ""}.`;
}

/**
 * Delivers an operator-approved message as a user turn on an existing Hermes
 * session through `POST /api/sessions/{id}/chat`. Unknown sessions are refused
 * (404) rather than created. Hermes runs the agent for that turn and answers
 * synchronously, so a timeout leaves the outcome unknown. The endpoint returns
 * no delivery identifier, so the receipt ID is generated locally.
 */
export function createHermesSessionDeliveryAdapter(
  options: HermesSessionDeliveryOptions
): ActiveSessionDeliveryAdapter {
  if (!options.apiKey.trim()) {
    throw new Error("A Hermes API server key is required for active-session delivery.");
  }
  const base = resolveBaseUrl(options.baseUrl ?? hermesApiServerDefaultBaseUrl);
  const request = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

  return {
    id: "hermes-api-server",
    async deliverMessage({ target, message }) {
      const hermesSessionId = resolveHermesSessionId(target);
      const endpoint = new URL(
        `api/sessions/${encodeURIComponent(hermesSessionId)}/chat`,
        `${base.origin}${base.pathname.replace(/\/?$/, "/")}`
      );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await request(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ message })
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(
            `Hermes did not finish within ${timeoutMs} ms; the message may or may not have been delivered.`
          );
        }
        throw new Error(
          `Hermes API server is unreachable: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        clearTimeout(timer);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      if (!response.ok) {
        throw new Error(describeFailure(response.status, body));
      }

      if (
        typeof body !== "object" ||
        body === null ||
        (body as { object?: unknown }).object !== "hermes.session.chat.completion"
      ) {
        throw new Error("Hermes returned an unexpected response; delivery is unconfirmed.");
      }
      return { deliveryId: `hermes-session-chat-${crypto.randomUUID()}` };
    }
  };
}

export type HermesNativeInvoke = <T>(
  command: string,
  payload?: Record<string, unknown>
) => Promise<T>;

export interface HermesNativeDeliveryStatus {
  configured: boolean;
  baseUrl?: string | null;
  allowRemote?: boolean;
  keyConfigured?: boolean;
  keySource?: "environment" | "settings" | null;
  baseUrlFromEnvironment?: boolean;
  allowRemoteFromEnvironment?: boolean;
  reason?: string | null;
}

export interface HermesNativeSettingsInput {
  baseUrl?: string | null;
  allowRemote: boolean;
  /** Write-only. Blank or omitted keeps the stored key. */
  apiKey?: string | null;
  clearApiKey?: boolean;
}

export async function getHermesNativeDeliveryStatus(
  invoke: HermesNativeInvoke
): Promise<HermesNativeDeliveryStatus> {
  try {
    return await invoke<HermesNativeDeliveryStatus>("get_hermes_delivery_status");
  } catch {
    return { configured: false, reason: "Hermes delivery status is unavailable." };
  }
}

/** Saves settings natively; the returned status never contains the key. */
export async function saveHermesNativeDeliverySettings(
  invoke: HermesNativeInvoke,
  settings: HermesNativeSettingsInput
): Promise<HermesNativeDeliveryStatus> {
  try {
    return await invoke<HermesNativeDeliveryStatus>("save_hermes_delivery_settings", {
      settings
    });
  } catch (error) {
    throw new Error(
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Hermes delivery settings could not be saved."
    );
  }
}

/**
 * Delivers through the native runtime so the Hermes API key stays in the native
 * process environment and the webview never sees it.
 */
export function createNativeHermesSessionDeliveryAdapter(
  invoke: HermesNativeInvoke
): ActiveSessionDeliveryAdapter {
  return {
    id: "hermes-api-server",
    async deliverMessage({ target, message }) {
      const hermesSessionId = resolveHermesSessionId(target);
      const result = await invoke<{ deliveryId?: unknown }>(
        "deliver_hermes_session_message",
        { hermesSessionId, message }
      );
      if (typeof result?.deliveryId !== "string" || !result.deliveryId) {
        throw new Error("Hermes delivery was not confirmed by the native runtime.");
      }
      return { deliveryId: result.deliveryId };
    }
  };
}

