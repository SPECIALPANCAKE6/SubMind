import { spawn } from "node:child_process";

declare const process: {
  env: Record<string, string | undefined>;
};

export interface WindowsCurlFetchOptions {
  command?: string;
}

const defaultCurlCommand = "/mnt/c/Windows/System32/curl.exe";
const statusMarker = "\n__SUBMIND_CURL_STATUS__:";

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

async function requestBodyToString(body: BodyInit | null | undefined) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof Blob) {
    return body.text();
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body);
  }

  throw new Error("windows-curl transport does not support this request body.");
}

function createAbortError(): Error {
  const error = new Error("The request was aborted.");
  error.name = "AbortError";
  return error;
}

function parseCurlOutput(output: string, stderr: string): Response {
  const markerIndex = output.lastIndexOf(statusMarker);

  if (markerIndex === -1) {
    throw new Error(
      stderr.trim() || "windows-curl transport did not return an HTTP status."
    );
  }

  const body = output.slice(0, markerIndex);
  const statusText = output.slice(markerIndex + statusMarker.length).trim();
  const status = Number(statusText);

  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error(
      stderr.trim() || `windows-curl transport returned invalid status ${statusText}.`
    );
  }

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export function createWindowsCurlFetch(
  options: WindowsCurlFetchOptions = {}
): typeof fetch {
  const command =
    options.command ?? process.env.SUBMIND_WINDOWS_CURL ?? defaultCurlCommand;

  return async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init.method ?? (input instanceof Request ? input.method : "GET");
    const headers = normalizeHeaders(
      init.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    const body = await requestBodyToString(init.body);
    const args = [
      "-sS",
      "-X",
      method,
      "-w",
      `${statusMarker}%{http_code}`,
      ...Object.entries(headers).flatMap(([name, value]) => [
        "-H",
        `${name}: ${value}`
      ]),
      ...(body === undefined ? [] : ["--data-binary", "@-"]),
      url
    ];

    return await new Promise<Response>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"]
      });
      const stdoutDecoder = new TextDecoder();
      const stderrDecoder = new TextDecoder();
      let stdout = "";
      let stderr = "";
      let settled = false;

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        init.signal?.removeEventListener("abort", abort);
        callback();
      };

      const abort = () => {
        child.kill("SIGTERM");
        settle(() => reject(createAbortError()));
      };

      if (init.signal?.aborted) {
        abort();
        return;
      }

      init.signal?.addEventListener("abort", abort, { once: true });

      child.stdin.on("error", (error) => {
        settle(() => reject(error));
      });
      child.stdout.on("data", (chunk) => {
        stdout += stdoutDecoder.decode(chunk, { stream: true });
      });
      child.stderr.on("data", (chunk) => {
        stderr += stderrDecoder.decode(chunk, { stream: true });
      });
      child.on("error", (error) => {
        settle(() => reject(error));
      });
      child.on("close", (code) => {
        stdout += stdoutDecoder.decode();
        stderr += stderrDecoder.decode();

        settle(() => {
          if (code !== 0) {
            reject(new Error(stderr.trim() || `curl exited with status ${code}.`));
            return;
          }

          try {
            resolve(parseCurlOutput(stdout, stderr));
          } catch (error) {
            reject(error);
          }
        });
      });

      if (body !== undefined) {
        child.stdin.write(body);
      }
      child.stdin.end();
    });
  };
}

export function createFetchFromEnvironment(): typeof fetch | undefined {
  const transport = process.env.SUBMIND_API_TRANSPORT?.trim().toLowerCase();

  if (transport !== "windows-curl") {
    return undefined;
  }

  return createWindowsCurlFetch();
}
