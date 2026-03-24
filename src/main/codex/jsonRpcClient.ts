import {
  type JsonRpcErrorResponse,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest
} from "../../shared/types.js";

type NotificationListener = (notification: JsonRpcNotification) => void;
type RequestListener = (request: JsonRpcRequest) => void | Promise<void>;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

export class JsonRpcWebSocketClient {
  private ws?: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationListeners = new Set<NotificationListener>();
  private readonly requestListeners = new Set<RequestListener>();

  async connect(url: string, timeoutMs = 10_000): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        ws.close();
        reject(new Error(`Timed out connecting to ${url}.`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        ws.removeEventListener("open", handleOpen);
        ws.removeEventListener("error", handleError);
      };

      const handleOpen = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error(`Failed to connect to ${url}.`));
      };

      ws.addEventListener("open", handleOpen);
      ws.addEventListener("error", handleError);
    });

    ws.addEventListener("message", (event) => {
      void this.handleMessage(event);
    });

    ws.addEventListener("close", () => {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Connection closed before request ${String(id)} completed.`));
      }
      this.pending.clear();
    });
  }

  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onRequest(listener: RequestListener): () => void {
    this.requestListeners.add(listener);
    return () => this.requestListeners.delete(listener);
  }

  async request<TResult>(method: string, params: unknown, timeoutMs = 60_000): Promise<TResult> {
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0" as const,
      id,
      method,
      params
    };

    const promise = new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
    });

    this.send(payload);
    return promise;
  }

  notify(method: string, params?: unknown): void {
    const payload =
      typeof params === "undefined"
        ? { jsonrpc: "2.0" as const, method }
        : { jsonrpc: "2.0" as const, method, params };
    this.send(payload);
  }

  respondError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
    this.send({
      jsonrpc: "2.0" as const,
      id,
      error: {
        code,
        message,
        ...(typeof data === "undefined" ? {} : { data })
      }
    });
  }

  close(): void {
    this.ws?.close();
  }

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected.");
    }

    this.ws.send(JSON.stringify(payload));
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    const raw = await messageDataToString(event.data);
    const message = JSON.parse(raw) as JsonRpcMessage;

    if ("id" in message && "method" in message) {
      for (const listener of this.requestListeners) {
        await listener(message);
      }
      return;
    }

    if ("id" in message && "result" in message) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      pending.resolve(message.result);
      return;
    }

    if (isJsonRpcErrorResponse(message)) {
      const pending = this.pending.get(message.id ?? -1);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(message.id ?? -1);
      pending.reject(new Error(message.error.message));
      return;
    }

    if ("method" in message) {
      for (const listener of this.notificationListeners) {
        listener(message);
      }
    }
  }
}

function isJsonRpcErrorResponse(message: JsonRpcMessage): message is JsonRpcErrorResponse {
  return "error" in message;
}

async function messageDataToString(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }

  if (data instanceof Blob) {
    return await data.text();
  }

  throw new Error(`Unsupported WebSocket message payload: ${typeof data}`);
}
