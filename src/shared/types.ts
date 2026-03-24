export type JsonRpcId = number | string;

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params: TParams;
}

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: TResult;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

export interface InitializeParams {
  clientInfo: {
    name: string;
    title: string | null;
    version: string;
  };
  capabilities: {
    experimentalApi: boolean;
    optOutNotificationMethods?: string[] | null;
  } | null;
}

export interface InitializeResult {
  userAgent: string;
  platformFamily: string;
  platformOs: string;
}

export interface ThreadStartResult {
  thread: {
    id: string;
    preview: string;
    cwd: string;
    status: {
      type: string;
      activeFlags?: string[];
    };
  };
}

export interface TurnStartResult {
  turn: {
    id: string;
    status: {
      type: string;
    };
    error: {
      message?: string;
    } | null;
  };
}

export type DeskPetState =
  | "idle"
  | "thinking"
  | "typing"
  | "working"
  | "editing"
  | "subagent_one"
  | "subagent_many"
  | "approval"
  | "error"
  | "success"
  | "sleeping";

export interface MonitorEvent {
  timestamp: string;
  kind: string;
  sourceId?: string;
  sourceLabel?: string;
  stateHint?: DeskPetState;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  itemType?: string;
  status?: string;
  activeFlags?: string[];
  delta?: string;
  preview?: string;
  requestMethod?: string;
  error?: string;
  raw: unknown;
}

export interface ThreadSessionView {
  sourceId?: string;
  sourceLabel?: string;
  threadId: string;
  baseState: DeskPetState;
  displayState: DeskPetState;
  status?: string;
  activeFlags: string[];
  currentTurnId?: string;
  lastEventKind: string;
  lastItemType?: string;
  lastDelta?: string;
  lastPreview?: string;
  lastError?: string;
  eventCount: number;
  updatedAt: string;
}

export interface MonitorSnapshot {
  connected: boolean;
  initialized: boolean;
  serverPlatform?: string;
  currentState: DeskPetState;
  totalEvents: number;
  updatedAt?: string;
  threads: ThreadSessionView[];
  recentEvents: MonitorEvent[];
}

export type AppServerConnectionMode = "managed" | "external" | "auto";

export interface AppServerConnectionConfig {
  mode: AppServerConnectionMode;
  cwd?: string;
  port?: number;
  listenUrl?: string;
}

export interface ConnectionDebugInfo {
  mode: AppServerConnectionMode;
  listenUrl?: string;
  listenUrls?: string[];
  connected: boolean;
  initialized: boolean;
  connectedSources?: number;
  initializedSources?: number;
  totalSources?: number;
  lastEventAt?: string;
  errorMessage?: string;
  errorMessages?: string[];
}

export type BubbleDetailMode = "basic" | "detailed";

export interface BubbleConfig {
  visible: boolean;
  detailMode: BubbleDetailMode;
  spacingPx: number;
}

export interface BubbleRenderMeta {
  detailOverride?: string;
}

export interface AppearanceConfig {
  accentColor?: string;
}

export type RuntimeStatus = "starting" | "ready" | "error";

export interface DesktopPetSnapshot {
  runtimeStatus: RuntimeStatus;
  clickThrough: boolean;
  errorMessage?: string;
  connection: ConnectionDebugInfo;
  monitor: MonitorSnapshot;
}
