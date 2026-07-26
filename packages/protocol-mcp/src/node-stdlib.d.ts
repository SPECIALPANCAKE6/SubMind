declare module "node:child_process" {
  export interface ChildProcessWithoutNullStreams {
    stdin: {
      write(chunk: string): boolean;
      end(): void;
      on(event: "error", listener: (error: Error) => void): void;
    };
    stdout: {
      on(event: "data", listener: (chunk: Uint8Array) => void): void;
    };
    stderr: {
      on(event: "data", listener: (chunk: Uint8Array) => void): void;
    };
    on(event: "error", listener: (error: Error) => void): void;
    on(
      event: "close",
      listener: (code: number | null, signal: string | null) => void
    ): void;
    kill(signal?: string): boolean;
  }

  export function spawn(
    command: string,
    args?: readonly string[],
    options?: { stdio?: readonly ["pipe", "pipe", "pipe"] }
  ): ChildProcessWithoutNullStreams;
}
