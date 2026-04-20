import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import type { ConnectionDebugInfo, MonitorEvent } from "../../shared/types.js";

interface SessionFileMonitorOptions {
  sessionRoot?: string;
  sourceId?: string;
  sourceLabel?: string;
  scanIntervalMs?: number;
  activeWindowMs?: number;
}

interface SessionFileMonitorResolvedOptions {
  sessionRoot: string;
  sourceId?: string;
  sourceLabel?: string;
  scanIntervalMs: number;
  activeWindowMs: number;
}

interface SessionRecord {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface SessionFileState {
  path: string;
  offset: number;
  sessionId?: string;
  cwd?: string;
  sourceLabel: string;
  lastEventAt?: string;
  lastSeenMs: number;
}

type EventListener = (event: MonitorEvent) => void | Promise<void>;

const DEFAULT_SCAN_INTERVAL_MS = 1_500;
const DEFAULT_ACTIVE_WINDOW_MS = 30 * 60 * 1_000;
const INITIAL_TAIL_BYTES = 256 * 1024;
const NEWLINE_BYTE = 0x0a;

export class SessionFileMonitor {
  private readonly options: SessionFileMonitorResolvedOptions;
  private readonly listeners = new Set<EventListener>();
  private readonly files = new Map<string, SessionFileState>();
  private scanTimer?: NodeJS.Timeout;
  private scanInFlight = false;
  private connected = false;
  private initialized = false;
  private lastEventAt?: string;
  private errorMessage?: string;

  constructor(options: SessionFileMonitorOptions = {}) {
    this.options = {
      sessionRoot: options.sessionRoot ?? join(homedir(), ".codex", "sessions"),
      sourceId: options.sourceId,
      sourceLabel: options.sourceLabel,
      scanIntervalMs: options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS,
      activeWindowMs: options.activeWindowMs ?? DEFAULT_ACTIVE_WINDOW_MS
    };
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.scanTimer) {
      return;
    }

    this.connected = true;
    this.initialized = true;
    this.errorMessage = undefined;

    await this.emitEvent({
      timestamp: new Date().toISOString(),
      kind: "lifecycle.connected",
      raw: {
        mode: "auto",
        sessionRoot: this.options.sessionRoot
      }
    });

    await this.emitEvent({
      timestamp: new Date().toISOString(),
      kind: "server.initialized",
      preview: "codex-session-files/auto",
      raw: {
        mode: "auto",
        sessionRoot: this.options.sessionRoot
      }
    });

    await this.scanOnce();
    this.scanTimer = setInterval(() => {
      void this.scanOnce();
    }, this.options.scanIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }

    const wasConnected = this.connected || this.initialized;
    this.connected = false;
    this.initialized = false;
    this.files.clear();

    if (wasConnected) {
      await this.emitEvent({
        timestamp: new Date().toISOString(),
        kind: "lifecycle.disconnected",
        raw: {
          mode: "auto",
          sessionRoot: this.options.sessionRoot
        }
      });
    }
  }

  getConnectionDebugInfo(): ConnectionDebugInfo {
    const activeFiles = [...this.files.values()]
      .sort((left, right) => right.lastSeenMs - left.lastSeenMs)
      .map((file) => file.path);

    return {
      mode: "auto",
      listenUrl: this.options.sessionRoot,
      listenUrls: activeFiles,
      connected: this.connected,
      initialized: this.initialized,
      connectedSources: activeFiles.length,
      initializedSources: activeFiles.length,
      totalSources: activeFiles.length,
      lastEventAt: this.lastEventAt,
      errorMessage: this.errorMessage,
      errorMessages: this.errorMessage ? [this.errorMessage] : []
    };
  }

  private async scanOnce(): Promise<void> {
    if (this.scanInFlight) {
      return;
    }

    this.scanInFlight = true;

    try {
      const now = Date.now();
      const sessionFiles = await listJsonlFiles(this.options.sessionRoot);

      for (const path of sessionFiles) {
        const stats = await stat(path);
        if (now - stats.mtimeMs > this.options.activeWindowMs) {
          continue;
        }

        const fileState =
          this.files.get(path) ??
          ({
            path,
            offset: Math.max(0, stats.size - INITIAL_TAIL_BYTES),
            sourceLabel: basename(path),
            lastSeenMs: stats.mtimeMs
          } satisfies SessionFileState);

        fileState.lastSeenMs = stats.mtimeMs;
        this.files.set(path, fileState);
        await this.readAppendedRecords(fileState);
      }

      for (const [path, fileState] of this.files) {
        if (now - fileState.lastSeenMs > this.options.activeWindowMs) {
          this.files.delete(path);
        }
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.scanInFlight = false;
    }
  }

  private async readAppendedRecords(fileState: SessionFileState): Promise<void> {
    const contents = await readFile(fileState.path);
    if (contents.length <= fileState.offset) {
      return;
    }

    const chunk = contents.subarray(fileState.offset);
    let firstCompleteLineStart = 0;

    // The initial tail offset is measured in bytes and can land in the middle
    // of a UTF-8 sequence or JSONL record, so skip forward to the next newline.
    if (fileState.offset > 0 && contents[fileState.offset - 1] !== NEWLINE_BYTE) {
      const firstNewlineIndex = chunk.indexOf(NEWLINE_BYTE);
      if (firstNewlineIndex === -1) {
        return;
      }
      firstCompleteLineStart = firstNewlineIndex + 1;
    }

    const lastNewlineIndex = chunk.lastIndexOf(NEWLINE_BYTE);
    if (lastNewlineIndex < firstCompleteLineStart) {
      return;
    }

    const completeChunk = chunk.subarray(firstCompleteLineStart, lastNewlineIndex + 1);
    const completeLines = completeChunk.toString("utf8").split("\n").filter(Boolean);

    if (completeLines.length === 0) {
      fileState.offset += lastNewlineIndex + 1;
      return;
    }

    fileState.offset += lastNewlineIndex + 1;

    for (const line of completeLines) {
      const record = parseSessionRecord(line);
      if (!record) {
        continue;
      }

      const events = mapSessionRecordToEvents(record, fileState);
      for (const event of events) {
        await this.emitEvent(event);
      }
    }
  }

  private async emitEvent(event: MonitorEvent): Promise<void> {
    const enrichedEvent: MonitorEvent = {
      ...event,
      sourceId: event.sourceId ?? this.options.sourceId ?? "auto:sessions",
      sourceLabel: event.sourceLabel ?? this.options.sourceLabel ?? "codex auto"
    };

    this.lastEventAt = enrichedEvent.timestamp;

    for (const listener of this.listeners) {
      await listener(enrichedEvent);
    }
  }
}

function parseSessionRecord(line: string): SessionRecord | undefined {
  try {
    return JSON.parse(line) as SessionRecord;
  } catch {
    return undefined;
  }
}

function mapSessionRecordToEvents(
  record: SessionRecord,
  fileState: SessionFileState
): MonitorEvent[] {
  const timestamp = record.timestamp ?? new Date().toISOString();
  const payload = record.payload ?? {};

  if (record.type === "session_meta") {
    const sessionId = getString(payload, "id");
    const cwd = getString(payload, "cwd");

    fileState.sessionId = sessionId ?? fileState.sessionId ?? basename(fileState.path);
    fileState.cwd = cwd ?? fileState.cwd;
    fileState.sourceLabel = cwd ? `${basename(cwd)} (${basename(fileState.path)})` : basename(fileState.path);

    return [
      {
        timestamp,
        kind: "thread.started",
        threadId: fileState.sessionId,
        status: "idle",
        preview: cwd ?? basename(fileState.path),
        sourceId: `auto:${fileState.sessionId ?? basename(fileState.path)}`,
        sourceLabel: fileState.sourceLabel,
        raw: record
      }
    ];
  }

  if (record.type === "event_msg") {
    const payloadType = getString(payload, "type");
    const sessionId = fileState.sessionId ?? basename(fileState.path);
    const turnId = getString(payload, "turn_id");

    switch (payloadType) {
      case "task_started":
        return [
          {
            timestamp,
            kind: "thread.status.changed",
            threadId: sessionId,
            status: "active",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          },
          {
            timestamp,
            kind: "turn.started",
            threadId: sessionId,
            turnId,
            status: "active",
            stateHint: "thinking",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          }
        ];
      case "agent_message":
        return [
          {
            timestamp,
            kind: "item.agentMessage.delta",
            threadId: sessionId,
            turnId,
            delta: getString(payload, "message"),
            stateHint: "typing",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          }
        ];
      case "task_complete":
        return [
          {
            timestamp,
            kind: "thread.status.changed",
            threadId: sessionId,
            status: "idle",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          },
          {
            timestamp,
            kind: "turn.completed",
            threadId: sessionId,
            turnId,
            status: "completed",
            stateHint: "success",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          }
        ];
      case "turn_aborted":
        return [
          {
            timestamp,
            kind: "thread.status.changed",
            threadId: sessionId,
            status: "idle",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          },
          {
            timestamp,
            kind: "turn.completed",
            threadId: sessionId,
            turnId,
            status: "failed",
            error: "Turn aborted",
            stateHint: "error",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          }
        ];
      default:
        return [];
    }
  }

  if (record.type === "response_item") {
    const itemType = getString(payload, "type");
    const sessionId = fileState.sessionId ?? basename(fileState.path);

    switch (itemType) {
      case "reasoning":
        return [
          {
            timestamp,
            kind: "item.reasoning.delta",
            threadId: sessionId,
            delta: summarizeReasoning(payload),
            stateHint: "thinking",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          }
        ];
      case "function_call":
      case "custom_tool_call":
        return [
          {
            timestamp,
            kind: "item.started",
            threadId: sessionId,
            itemType: itemType === "function_call" ? "dynamicToolCall" : "mcpToolCall",
            stateHint: "working",
            preview: getString(payload, "name"),
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          }
        ];
      case "function_call_output":
      case "custom_tool_call_output":
        return [
          {
            timestamp,
            kind: "item.completed",
            threadId: sessionId,
            itemType: itemType === "function_call_output" ? "dynamicToolCall" : "mcpToolCall",
            sourceId: `auto:${sessionId}`,
            sourceLabel: fileState.sourceLabel,
            raw: record
          }
        ];
      default:
        return [];
    }
  }

  return [];
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonlFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function getString(value: Record<string, unknown>, key: string): string | undefined {
  const result = value[key];
  return typeof result === "string" ? result : undefined;
}

function summarizeReasoning(payload: Record<string, unknown>): string | undefined {
  const summary = payload.summary;
  if (!Array.isArray(summary)) {
    return undefined;
  }

  const texts = summary
    .map((entry) =>
      entry && typeof entry === "object" && "text" in entry && typeof entry.text === "string"
        ? entry.text
        : undefined
    )
    .filter((value): value is string => Boolean(value));

  return texts.join(" ").trim() || undefined;
}
