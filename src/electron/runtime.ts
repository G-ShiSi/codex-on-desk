import type {
  AppServerConnectionConfig,
  ConnectionDebugInfo,
  DesktopPetSnapshot,
  MonitorEvent,
  RuntimeStatus
} from "../shared/types.js";
import { AppServerMonitor } from "../main/codex/appServerMonitor.js";
import { SessionFileMonitor } from "../main/codex/sessionFileMonitor.js";
import { MonitorStateAggregator } from "../main/state/aggregator.js";

type SnapshotListener = (snapshot: DesktopPetSnapshot) => void;
type EventListener = (event: MonitorEvent) => void | Promise<void>;

interface RuntimeMonitor {
  start(config?: AppServerConnectionConfig): Promise<unknown>;
  stop(): Promise<void>;
  onEvent(listener: EventListener): () => void;
  getConnectionDebugInfo(): ConnectionDebugInfo;
  runPrompt?(prompt: string): Promise<{ threadId: string; turnId: string }>;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class CodexRuntime {
  private readonly aggregator = new MonitorStateAggregator();
  private readonly listeners = new Set<SnapshotListener>();
  private readonly cwd: string;
  private monitors: RuntimeMonitor[] = [];
  private runtimeStatus: RuntimeStatus = "starting";
  private errorMessage?: string;
  private clickThrough = false;
  private connectionConfig: AppServerConnectionConfig;

  constructor(cwd: string, initialConfig?: AppServerConnectionConfig) {
    this.cwd = cwd;
    this.connectionConfig = initialConfig ?? getInitialConnectionConfig(cwd);

    this.aggregator.onSnapshot(() => {
      this.emitSnapshot();
    });
  }

  async start(): Promise<void> {
    this.runtimeStatus = "starting";
    this.errorMessage = undefined;
    this.aggregator.reset();
    this.emitSnapshot();

    try {
      const errors = await this.startConfiguredMonitors();
      this.runtimeStatus = this.monitors.length > 0 ? "ready" : "error";
      this.errorMessage = errors.length > 0 ? errors.join(" | ") : undefined;
      this.emitSnapshot();
    } catch (error) {
      this.runtimeStatus = "error";
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.emitSnapshot();
    }
  }

  async runPrompt(prompt: string): Promise<{ threadId: string; turnId: string }> {
    const managedMonitor = this.monitors.find(
      (monitor) => monitor.getConnectionDebugInfo().mode === "managed" && monitor.runPrompt
    );

    if (!managedMonitor?.runPrompt) {
      throw new Error("runPrompt is only available in managed mode.");
    }

    return await managedMonitor.runPrompt(prompt);
  }

  async setManagedMode(): Promise<void> {
    this.connectionConfig = {
      mode: "managed",
      cwd: this.cwd
    };
    await this.restart();
  }

  async setExternalMode(listenUrl: string): Promise<void> {
    this.connectionConfig = {
      mode: "external",
      listenUrl
    };
    await this.restart();
  }

  async setAutoMode(): Promise<void> {
    this.connectionConfig = {
      mode: "auto"
    };
    await this.restart();
  }

  getConnectionConfig(): AppServerConnectionConfig {
    return { ...this.connectionConfig };
  }

  onSnapshot(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): DesktopPetSnapshot {
    return {
      runtimeStatus: this.runtimeStatus,
      clickThrough: this.clickThrough,
      errorMessage: this.errorMessage,
      connection: this.getConnectionDebugInfo(),
      monitor: this.aggregator.getSnapshot()
    };
  }

  setClickThrough(clickThrough: boolean): void {
    this.clickThrough = clickThrough;
    this.emitSnapshot();
  }

  async stop(): Promise<void> {
    const activeMonitors = this.monitors;
    this.monitors = [];
    await Promise.all(activeMonitors.map((monitor) => monitor.stop()));
  }

  private emitSnapshot(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async startConfiguredMonitors(): Promise<string[]> {
    const monitorEntries = this.createMonitorEntries();
    const results = await Promise.allSettled(
      monitorEntries.map(async (monitor) => {
        await monitor.start(this.connectionConfig);
        return monitor;
      })
    );

    const nextMonitors: RuntimeMonitor[] = [];
    const errors: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        nextMonitors.push(result.value);
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }

    this.monitors = nextMonitors;
    return errors;
  }

  private createMonitorEntries(): RuntimeMonitor[] {
    if (this.connectionConfig.mode === "managed") {
      return [this.createManagedMonitor()];
    }

    if (this.connectionConfig.mode === "external") {
      return getConfiguredExternalUrls(this.connectionConfig.listenUrl).map((listenUrl, index) =>
        this.createExternalMonitor(listenUrl, index)
      );
    }

    return [this.createAutoMonitor()];
  }

  private createManagedMonitor(): RuntimeMonitor {
    return this.bindMonitor(
      new AppServerMonitor({
        cwd: this.cwd,
        sourceId: "managed",
        sourceLabel: "managed",
        timeoutMs: DEFAULT_TIMEOUT_MS
      })
    );
  }

  private createExternalMonitor(listenUrl: string, index: number): RuntimeMonitor {
    return this.bindMonitor(
      new AppServerMonitor({
        cwd: this.cwd,
        listenUrl,
        sourceId: `external:${index}:${listenUrl}`,
        sourceLabel: listenUrl,
        timeoutMs: DEFAULT_TIMEOUT_MS
      })
    );
  }

  private createAutoMonitor(): RuntimeMonitor {
    return this.bindMonitor(
      new SessionFileMonitor({
        sourceId: "auto:sessions",
        sourceLabel: "codex auto"
      })
    );
  }

  private bindMonitor<T extends RuntimeMonitor>(monitor: T): T {
    monitor.onEvent((event) => {
      this.aggregator.applyEvent(event);
    });
    return monitor;
  }

  private getConnectionDebugInfo(): ConnectionDebugInfo {
    const monitorInfos = this.monitors.map((monitor) => monitor.getConnectionDebugInfo());
    const requestedExternalUrls = getConfiguredExternalUrls(this.connectionConfig.listenUrl);
    const listenUrls = dedupeStrings(
      monitorInfos.flatMap((info) => info.listenUrls ?? (info.listenUrl ? [info.listenUrl] : []))
    );
    const errorMessages = dedupeStrings(
      [this.errorMessage, ...monitorInfos.flatMap((info) => info.errorMessages ?? (info.errorMessage ? [info.errorMessage] : []))]
        .filter((value): value is string => Boolean(value))
    );
    const lastEventAt = monitorInfos
      .map((info) => info.lastEventAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    return {
      mode: this.connectionConfig.mode,
      listenUrl:
        this.connectionConfig.mode === "external"
          ? requestedExternalUrls[0]
          : listenUrls[0],
      listenUrls:
        this.connectionConfig.mode === "external" ? requestedExternalUrls : listenUrls,
      connected: monitorInfos.some((info) => info.connected),
      initialized: monitorInfos.some((info) => info.initialized),
      connectedSources: monitorInfos.reduce(
        (total, info) => total + (info.connectedSources ?? (info.connected ? 1 : 0)),
        0
      ),
      initializedSources: monitorInfos.reduce(
        (total, info) => total + (info.initializedSources ?? (info.initialized ? 1 : 0)),
        0
      ),
      totalSources:
        this.connectionConfig.mode === "external"
          ? requestedExternalUrls.length
          : monitorInfos.reduce((total, info) => total + (info.totalSources ?? 0), 0) || 1,
      lastEventAt,
      errorMessage: errorMessages[0],
      errorMessages
    };
  }
}

function getInitialConnectionConfig(cwd: string): AppServerConnectionConfig {
  const externalUrls = getConfiguredExternalUrls();
  if (externalUrls.length > 0) {
    return { mode: "external", listenUrl: externalUrls[0] };
  }

  if (process.env.CODEX_DISABLE_AUTO_DISCOVERY === "1") {
    return { mode: "managed", cwd };
  }

  return { mode: "auto" };
}

function getConfiguredExternalUrls(primary?: string): string[] {
  const values = [
    ...(process.env.CODEX_APP_SERVER_URLS ?? "").split(/[\n,]/),
    process.env.CODEX_APP_SERVER_URL ?? "",
    primary ?? ""
  ];

  return dedupeStrings(values.map((value) => value.trim()).filter(Boolean));
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}
