import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, resolve } from "node:path";
import type { DesktopPetSnapshot } from "../../shared/types.js";
import type { CodexRuntime } from "../../electron/runtime.js";

interface DashboardServerOptions {
  staticRoot: string;
  runtime: CodexRuntime;
  port?: number;
}

interface SseClient {
  id: number;
  response: ServerResponse;
}

export class DashboardServer {
  private readonly options: DashboardServerOptions;
  private readonly clients = new Map<number, SseClient>();
  private server = createServer((request, response) => {
    void this.handleRequest(request, response);
  });
  private nextClientId = 1;

  constructor(options: DashboardServerOptions) {
    this.options = options;

    this.options.runtime.onSnapshot((snapshot) => {
      this.broadcastSnapshot(snapshot);
    });
  }

  async start(): Promise<{ port: number }> {
    const port = this.options.port ?? 4580;

    await new Promise<void>((resolvePromise, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "127.0.0.1", () => resolvePromise());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      return { port };
    }

    return { port: (address as AddressInfo).port };
  }

  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      client.response.end();
    }
    this.clients.clear();

    await new Promise<void>((resolvePromise, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise();
      });
    });
  }

  getSnapshot(): DesktopPetSnapshot {
    return this.options.runtime.getSnapshot();
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (method === "GET" && url.pathname === "/events") {
      this.handleSse(response);
      return;
    }

    if (method === "GET" && url.pathname === "/api/state") {
      this.json(response, 200, this.getSnapshot());
      return;
    }

    if (method === "POST" && url.pathname === "/api/prompt") {
      await this.handlePrompt(request, response);
      return;
    }

    if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      await this.serveStatic(response, "src/dashboard/index.html");
      return;
    }

    if (method === "GET" && url.pathname === "/app.js") {
      await this.serveStatic(response, "src/dashboard/app.js");
      return;
    }

    if (method === "GET" && url.pathname === "/app.css") {
      await this.serveStatic(response, "src/dashboard/app.css");
      return;
    }

    if (method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    this.json(response, 404, { error: "Not found" });
  }

  private handleSse(response: ServerResponse): void {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    const clientId = this.nextClientId++;
    this.clients.set(clientId, { id: clientId, response });
    response.write(`event: snapshot\ndata: ${JSON.stringify(this.getSnapshot())}\n\n`);

    response.on("close", () => {
      this.clients.delete(clientId);
    });
  }

  private broadcastSnapshot(snapshot: DesktopPetSnapshot): void {
    const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
    for (const client of this.clients.values()) {
      client.response.write(payload);
    }
  }

  private async handlePrompt(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    try {
      const body = await readJsonBody<{ prompt?: string }>(request);
      const prompt = body.prompt?.trim();

      if (!prompt) {
        this.json(response, 400, { error: "prompt is required" });
        return;
      }

      const result = await this.options.runtime.runPrompt(prompt);
      this.json(response, 202, result);
    } catch (error) {
      this.json(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async serveStatic(response: ServerResponse, relativePath: string): Promise<void> {
    const absolutePath = resolve(this.options.staticRoot, relativePath);
    const contents = await readFile(absolutePath);

    response.writeHead(200, {
      "Content-Type": contentTypeForPath(absolutePath)
    });
    response.end(contents);
  }

  private json(response: ServerResponse, statusCode: number, body: unknown): void {
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify(body));
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function contentTypeForPath(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
