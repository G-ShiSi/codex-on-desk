import { createConnection, createServer } from "node:net";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

export interface AppServerProcessOptions {
  cwd: string;
  port?: number;
  sessionSource?: string;
  startupTimeoutMs?: number;
}

export class AppServerProcess {
  readonly port: number;
  readonly listenUrl: string;

  private readonly options: AppServerProcessOptions;
  private child?: ChildProcessByStdio<null, Readable, Readable>;
  private stderrBuffer = "";
  private stdoutBuffer = "";

  private constructor(options: AppServerProcessOptions, port: number) {
    this.options = options;
    this.port = port;
    this.listenUrl = `ws://127.0.0.1:${port}`;
  }

  static async create(options: AppServerProcessOptions): Promise<AppServerProcess> {
    const port = options.port ?? (await findFreePort());
    return new AppServerProcess(options, port);
  }

  get stderr(): string {
    return this.stderrBuffer.trim();
  }

  get stdout(): string {
    return this.stdoutBuffer.trim();
  }

  async start(): Promise<void> {
    if (this.child) {
      throw new Error("Codex app-server is already running.");
    }

    const child = spawn(
      "codex",
      [
        "app-server",
        "--listen",
        this.listenUrl,
        "--session-source",
        this.options.sessionSource ?? "codex-on-desk"
      ],
      {
        cwd: this.options.cwd,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      this.stderrBuffer += chunk;
    });

    await waitForPort({
      host: "127.0.0.1",
      port: this.port,
      timeoutMs: this.options.startupTimeoutMs ?? 10_000,
      child
    });
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;

    if (!child || child.exitCode !== null) {
      return;
    }

    child.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 3_000).unref();
    });
  }
}

async function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate a free TCP port."));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForPort(options: {
  host: string;
  port: number;
  timeoutMs: number;
  child: ChildProcessByStdio<null, Readable, Readable>;
}): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    if (options.child.exitCode !== null) {
      throw new Error(
        `codex app-server exited early with code ${options.child.exitCode}.`
      );
    }

    const isReachable = await canConnect(options.host, options.port);
    if (isReachable) {
      return;
    }

    await sleep(100);
  }

  throw new Error(
    `Timed out waiting for codex app-server on ${options.host}:${options.port}.`
  );
}

async function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
