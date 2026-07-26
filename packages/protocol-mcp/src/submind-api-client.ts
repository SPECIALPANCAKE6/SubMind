import type {
  ContextBundle,
  ContextDatumKind,
  ExternalProjectSummary
} from "@submind/shared-schemas";

declare const process: {
  env: Record<string, string | undefined>;
};

const defaultApiUrl = "http://127.0.0.1:47821";
const minimumTokenLength = 32;
const defaultTimeoutMs = 20_000;
const maximumResponseBytes = 2 * 1024 * 1024;

export interface SearchProjectsRequest {
  query?: string;
  limit?: number;
}

export interface SearchProjectsResponse {
  kind: "ExternalProjectSummaryList";
  apiVersion: "v1";
  projects: ExternalProjectSummary[];
}

export interface GetContextBundleRequest {
  projectId?: string;
  projectQuery?: string;
  threadId?: string;
  prompt: string;
  maxItems?: number;
  maxTokens?: number;
  kinds?: ContextDatumKind[];
}

export interface SubMindApiClientOptions {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface SubMindApiClient {
  searchProjects(request?: SearchProjectsRequest): Promise<SearchProjectsResponse>;
  getContextBundle(request: GetContextBundleRequest): Promise<ContextBundle>;
}

export class SubMindApiError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, code: string, status: number | null = null) {
    super(message);
    this.name = "SubMindApiError";
    this.code = code;
    this.status = status;
  }
}

function resolveApiUrl(value: string | undefined): URL {
  let url: URL;

  try {
    url = new URL(value?.trim() || defaultApiUrl);
  } catch {
    throw new SubMindApiError(
      "SUBMIND_API_URL is not a valid URL.",
      "invalid_api_url"
    );
  }

  const hostname = url.hostname.toLowerCase();
  const isLoopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(
    hostname
  );

  if (!isLoopback || !["http:", "https:"].includes(url.protocol)) {
    throw new SubMindApiError(
      "The SubMind context bridge only connects to a loopback SubMind API URL.",
      "non_loopback_api_url"
    );
  }

  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function resolveToken(value: string | undefined): string {
  const token = value?.trim() ?? "";

  if (token.length < minimumTokenLength) {
    throw new SubMindApiError(
      "SUBMIND_API_TOKEN must contain at least 32 characters.",
      "missing_api_token"
    );
  }

  return token;
}

function createRequestUrl(baseUrl: URL, path: string): URL {
  return new URL(path, `${baseUrl.toString().replace(/\/$/, "")}/`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApiError(value: unknown, status: number): SubMindApiError {
  if (status === 401) {
    return new SubMindApiError(
      "SubMind rejected the configured bearer token.",
      "unauthorized",
      status
    );
  }

  if (isRecord(value) && typeof value.error === "string") {
    const message =
      typeof value.message === "string"
        ? value.message.slice(0, 300)
        : "SubMind rejected the request.";
    return new SubMindApiError(message, value.error, status);
  }

  return new SubMindApiError(
    `SubMind returned HTTP ${status}.`,
    "api_request_failed",
    status
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SubMindApiError(
      "SubMind returned invalid JSON.",
      "invalid_api_response"
    );
  }
}

export function createSubMindApiClient(
  options: SubMindApiClientOptions = {}
): SubMindApiClient {
  const baseUrl = resolveApiUrl(options.baseUrl ?? process.env.SUBMIND_API_URL);
  const token = resolveToken(options.token ?? process.env.SUBMIND_API_TOKEN);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? defaultTimeoutMs);

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(createRequestUrl(baseUrl, path), {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...init.headers
        },
        redirect: "error",
        signal: controller.signal
      });
      const contentLength = Number(response.headers.get("content-length") ?? "0");

      if (Number.isFinite(contentLength) && contentLength > maximumResponseBytes) {
        throw new SubMindApiError(
          "SubMind returned a response larger than the bridge limit.",
          "response_too_large",
          response.status
        );
      }

      const text = await response.text();

      if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
        throw new SubMindApiError(
          "SubMind returned a response larger than the bridge limit.",
          "response_too_large",
          response.status
        );
      }

      const value = parseJson(text);

      if (!response.ok) {
        throw parseApiError(value, response.status);
      }

      return value;
    } catch (error) {
      if (error instanceof SubMindApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new SubMindApiError(
          "The SubMind API request timed out.",
          "api_timeout"
        );
      }

      throw new SubMindApiError(
        "The local SubMind API is unavailable. Start the SubMind desktop app with the same API token.",
        "api_unavailable"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async searchProjects(requestOptions = {}) {
      const url = new URL("/v1/projects", baseUrl);
      const query = requestOptions.query?.trim();

      if (query) {
        url.searchParams.set("query", query);
      }
      url.searchParams.set(
        "limit",
        String(Math.min(25, Math.max(1, requestOptions.limit ?? 10)))
      );

      const value = await request(`${url.pathname}${url.search}`, {
        method: "GET"
      });

      if (
        !isRecord(value) ||
        value.kind !== "ExternalProjectSummaryList" ||
        !Array.isArray(value.projects)
      ) {
        throw new SubMindApiError(
          "SubMind returned an invalid project search response.",
          "invalid_api_response"
        );
      }

      return value as unknown as SearchProjectsResponse;
    },

    async getContextBundle(bundleRequest) {
      const value = await request("/v1/context-bundle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bundleRequest)
      });

      if (
        !isRecord(value) ||
        value.kind !== "ContextBundle" ||
        value.apiVersion !== "v1" ||
        !Array.isArray(value.items) ||
        typeof value.composedContext !== "string" ||
        typeof value.auditEventId !== "string"
      ) {
        throw new SubMindApiError(
          "SubMind returned an invalid context bundle.",
          "invalid_api_response"
        );
      }

      return value as unknown as ContextBundle;
    }
  };
}
