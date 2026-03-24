import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AppServerProcess } from "./appServerProcess.js";
import { JsonRpcWebSocketClient } from "./jsonRpcClient.js";
import { normalizeNotification, normalizeServerRequest } from "./eventNormalizer.js";
import type {
  AppServerConnectionConfig,
  AppServerConnectionMode,
  ConnectionDebugInfo,
  InitializeResult,
  JsonRpcRequest,
  MonitorEvent,
  ThreadStartResult,
  TurnStartResult
} from "../../shared/types.js";

export interface AppServerMonitorOptions {
  cwd: string;
  port?: number;
  listenUrl?: string;
  recordPath?: string;
  model?: string;
  sourceId?: string;
  sourceLabel?: string;
  timeoutMs: number;
}

type EventListener = (event: MonitorEvent) => void | Promise<void>;

export class AppServerMonitor {
  private readonly options: AppServerMonitorOptions;
  private readonly listeners = new Set<EventListener>();
  private readonly turnWaiters = new Map<string, Array<(event: MonitorEvent) => void>>();
  private rpcClient = new JsonRpcWebSocketClient();
  private appServer?: AppServerProcess;
  private connectionMode: AppServerConnectionMode = "managed";
  private connected = false;
  private initialized = false;
  private currentListenUrl?: string;
  private lastEventAt?: string;
  private errorMessage?: string;

  constructor(options: AppServerMonitorOptions) {
    this.options = options;
    this.bindRpcClient();
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(config?: AppServerConnectionConfig): Promise<InitializeResult> {
    const nextConfig = config ?? {
      mode: this.options.listenUrl ? "external" : "managed",
      cwd: this.options.cwd,
      port: this.options.port,
      listenUrl: this.options.listenUrl
    };

    if (nextConfig.mode === "external") {
      if (!nextConfig.listenUrl) {
        throw new Error("External mode requires listenUrl.");
      }
      return await this.connectExternal(nextConfig.listenUrl);
    }

    return await this.startManaged({
      cwd: nextConfig.cwd ?? this.options.cwd,
      port: nextConfig.port ?? this.options.port
    });
  }

  async startManaged(config?: { cwd?: string; port?: number }): Promise<InitializeResult> {
    await this.stop();
    this.resetConnectionState("managed");

    const appServer = await AppServerProcess.create({
      cwd: config?.cwd ?? this.options.cwd,
      port: config?.port ?? this.options.port
    });
    this.appServer = appServer;

    await appServer.start();
    return await this.connectAndInitialize(appServer.listenUrl, "managed");
  }

  async connectExternal(listenUrl: string): Promise<InitializeResult> {
    await this.stop();
    this.resetConnectionState("external");
    return await this.connectAndInitialize(listenUrl, "external");
  }

  async runPrompt(prompt: string): Promise<{ threadId: string; turnId: string }> {
    const threadResult = await this.rpcClient.request<ThreadStartResult>(
      "thread/start",
      {
        cwd: this.options.cwd,
        model: this.options.model ?? null,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        experimentalRawEvents: false,
        persistExtendedHistory: false
      },
      this.options.timeoutMs
    );

    const turnResult = await this.rpcClient.request<TurnStartResult>(
      "turn/start",
      {
        threadId: threadResult.thread.id,
        input: [
          {
            type: "text",
            text: prompt,
            text_elements: []
          }
        ]
      },
      this.options.timeoutMs
    );

    return {
      threadId: threadResult.thread.id,
      turnId: turnResult.turn.id
    };
  }

  async waitForTurnCompletion(turnId: string, timeoutMs = this.options.timeoutMs): Promise<MonitorEvent> {
    return new Promise<MonitorEvent>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for turn completion: ${turnId}`));
      }, timeoutMs);

      const resolveAndCleanup = (event: MonitorEvent) => {
        clearTimeout(timeout);
        const waiters = this.turnWaiters.get(turnId) ?? [];
        this.turnWaiters.set(
          turnId,
          waiters.filter((waiter) => waiter !== resolveAndCleanup)
        );
        resolve(event);
      };

      const waiters = this.turnWaiters.get(turnId) ?? [];
      waiters.push(resolveAndCleanup);
      this.turnWaiters.set(turnId, waiters);
    });
  }

  async stop(): Promise<void> {
    const wasConnected = this.connected || this.initialized;
    this.connected = false;
    this.initialized = false;

    this.rpcClient.close();
    this.rpcClient = new JsonRpcWebSocketClient();
    this.bindRpcClient();

    if (this.connectionMode === "managed") {
      await this.appServer?.stop();
    }
    this.appServer = undefined;

    if (wasConnected) {
      await this.emitEvent({
        timestamp: new Date().toISOString(),
        kind: "lifecycle.disconnected",
        raw: {
          mode: this.connectionMode,
          listenUrl: this.currentListenUrl
        }
      });
    }
  }

  getConnectionDebugInfo(): ConnectionDebugInfo {
    return {
      mode: this.connectionMode,
      listenUrl: this.currentListenUrl,
      listenUrls: this.currentListenUrl ? [this.currentListenUrl] : [],
      connected: this.connected,
      initialized: this.initialized,
      connectedSources: this.connected ? 1 : 0,
      initializedSources: this.initialized ? 1 : 0,
      totalSources: this.currentListenUrl ? 1 : 0,
      lastEventAt: this.lastEventAt,
      errorMessage: this.errorMessage,
      errorMessages: this.errorMessage ? [this.errorMessage] : []
    };
  }

  private async handleServerRequest(request: JsonRpcRequest): Promise<void> {
    await this.emitEvent(normalizeServerRequest(request));
    this.rpcClient.respondError(
      request.id,
      -32601,
      `Server-initiated request is not implemented in phase 0 monitor: ${request.method}`
    );
  }

  private async emitEvent(event: MonitorEvent): Promise<void> {
    const enrichedEvent: MonitorEvent = {
      ...event,
      sourceId: event.sourceId ?? this.options.sourceId,
      sourceLabel: event.sourceLabel ?? this.options.sourceLabel ?? this.currentListenUrl
    };

    this.lastEventAt = enrichedEvent.timestamp;

    if (this.options.recordPath) {
      await ensureParentDirectory(this.options.recordPath);
      await appendFile(this.options.recordPath, `${JSON.stringify(enrichedEvent)}\n`, "utf8");
    }

    if (enrichedEvent.kind === "turn.completed" && enrichedEvent.turnId) {
      const waiters = this.turnWaiters.get(enrichedEvent.turnId) ?? [];
      for (const waiter of waiters) {
        waiter(enrichedEvent);
      }
      this.turnWaiters.delete(enrichedEvent.turnId);
    }

    for (const listener of this.listeners) {
      await listener(enrichedEvent);
    }
  }

  private bindRpcClient(): void {
    this.rpcClient.onNotification((notification) => {
      void this.emitEvent(normalizeNotification(notification));
    });

    this.rpcClient.onRequest((request) => this.handleServerRequest(request));
  }

  private async connectAndInitialize(
    listenUrl: string,
    mode: AppServerConnectionMode
  ): Promise<InitializeResult> {
    this.currentListenUrl = listenUrl;

    try {
      await this.rpcClient.connect(listenUrl, this.options.timeoutMs);

      this.connected = true;
      this.currentListenUrl = listenUrl;
      this.errorMessage = undefined;

      await this.emitEvent({
        timestamp: new Date().toISOString(),
        kind: "lifecycle.connected",
        raw: { listenUrl, mode }
      });

      const initializeResult = await this.rpcClient.request<InitializeResult>(
        "initialize",
        {
          clientInfo: {
            name: "codex-on-desk-monitor",
            title: "Codex on Desk Phase 0 Monitor",
            version: "0.1.0"
          },
          capabilities: {
            experimentalApi: false,
            optOutNotificationMethods: null
          }
        },
        this.options.timeoutMs
      );

      this.rpcClient.notify("initialized");
      this.initialized = true;

      await this.emitEvent({
        timestamp: new Date().toISOString(),
        kind: "server.initialized",
        preview: `${initializeResult.platformOs}/${initializeResult.platformFamily}`,
        raw: initializeResult
      });

      return initializeResult;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private resetConnectionState(mode: AppServerConnectionMode): void {
    this.connectionMode = mode;
    this.connected = false;
    this.initialized = false;
    this.currentListenUrl = undefined;
    this.lastEventAt = undefined;
    this.errorMessage = undefined;
  }
}

async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}
