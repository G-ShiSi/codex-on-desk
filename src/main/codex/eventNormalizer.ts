import type { DeskPetState, JsonRpcNotification, JsonRpcRequest, MonitorEvent } from "../../shared/types.js";

export function normalizeNotification(notification: JsonRpcNotification): MonitorEvent {
  const timestamp = new Date().toISOString();
  const params = notification.params as Record<string, unknown> | undefined;

  switch (notification.method) {
    case "thread/started":
      return {
        timestamp,
        kind: "thread.started",
        threadId: getString(params, "thread.id"),
        status: getString(params, "thread.status.type"),
        preview: getString(params, "thread.preview"),
        raw: notification
      };

    case "thread/status/changed": {
      const activeFlags = getStringArray(params, "status.activeFlags");
      return {
        timestamp,
        kind: "thread.status.changed",
        threadId: getString(params, "threadId"),
        status: getString(params, "status.type"),
        activeFlags,
        stateHint: activeFlags.includes("waitingOnApproval") ? "approval" : undefined,
        raw: notification
      };
    }

    case "turn/started":
      return {
        timestamp,
        kind: "turn.started",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turn.id"),
        status: getStringAtPaths(params, ["turn.status.type", "turn.status"]),
        stateHint: "thinking",
        raw: notification
      };

    case "turn/completed": {
      const status = getStringAtPaths(params, ["turn.status.type", "turn.status"]);
      return {
        timestamp,
        kind: "turn.completed",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turn.id"),
        status,
        error: getString(params, "turn.error.message"),
        stateHint: status === "failed" ? "error" : status === "completed" ? "success" : undefined,
        raw: notification
      };
    }

    case "item/started": {
      const itemType = getString(params, "item.type");
      return {
        timestamp,
        kind: "item.started",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turnId"),
        itemId: getString(params, "item.id"),
        itemType,
        stateHint: stateHintFromItemType(itemType, params),
        raw: notification
      };
    }

    case "item/completed": {
      const itemType = getString(params, "item.type");
      return {
        timestamp,
        kind: "item.completed",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turnId"),
        itemId: getString(params, "item.id"),
        itemType,
        raw: notification
      };
    }

    case "item/reasoning/summaryTextDelta":
      return {
        timestamp,
        kind: "item.reasoning.summary.delta",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turnId"),
        itemId: getString(params, "itemId"),
        delta: getString(params, "delta"),
        stateHint: "thinking",
        raw: notification
      };

    case "item/reasoning/textDelta":
      return {
        timestamp,
        kind: "item.reasoning.delta",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turnId"),
        itemId: getString(params, "itemId"),
        delta: getString(params, "delta"),
        stateHint: "thinking",
        raw: notification
      };

    case "item/agentMessage/delta":
      return {
        timestamp,
        kind: "item.agentMessage.delta",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turnId"),
        itemId: getString(params, "itemId"),
        delta: getString(params, "delta"),
        stateHint: "typing",
        raw: notification
      };

    case "item/commandExecution/outputDelta":
      return {
        timestamp,
        kind: "item.commandExecution.output.delta",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turnId"),
        itemId: getString(params, "itemId"),
        delta: getString(params, "delta"),
        stateHint: "working",
        raw: notification
      };

    case "item/fileChange/outputDelta":
      return {
        timestamp,
        kind: "item.fileChange.output.delta",
        threadId: getString(params, "threadId"),
        turnId: getString(params, "turnId"),
        itemId: getString(params, "itemId"),
        delta: getString(params, "delta"),
        stateHint: "editing",
        raw: notification
      };

    case "error":
      return {
        timestamp,
        kind: "server.error",
        error: getString(params, "message") ?? JSON.stringify(params ?? {}),
        stateHint: "error",
        raw: notification
      };

    default:
      return {
        timestamp,
        kind: `notification.${notification.method.replaceAll("/", ".")}`,
        raw: notification
      };
  }
}

export function normalizeServerRequest(request: JsonRpcRequest): MonitorEvent {
  return {
    timestamp: new Date().toISOString(),
    kind: "server.request",
    requestMethod: request.method,
    raw: request
  };
}

function stateHintFromItemType(
  itemType: string | undefined,
  params: Record<string, unknown> | undefined
): DeskPetState | undefined {
  switch (itemType) {
    case "commandExecution":
    case "mcpToolCall":
    case "dynamicToolCall":
      return "working";
    case "fileChange":
      return "editing";
    case "agentMessage":
      return "typing";
    case "reasoning":
    case "plan":
      return "thinking";
    case "collabAgentToolCall": {
      const receiverThreadIds = getValue(params, "item.receiverThreadIds");
      if (!Array.isArray(receiverThreadIds)) {
        return "subagent_one";
      }
      return receiverThreadIds.length > 1 ? "subagent_many" : "subagent_one";
    }
    default:
      return undefined;
  }
}

function getString(
  value: Record<string, unknown> | undefined,
  path: string
): string | undefined {
  const result = getValue(value, path);
  return typeof result === "string" ? result : undefined;
}

function getStringAtPaths(
  value: Record<string, unknown> | undefined,
  paths: string[]
): string | undefined {
  for (const path of paths) {
    const result = getString(value, path);
    if (typeof result === "string") {
      return result;
    }
  }
  return undefined;
}

function getStringArray(
  value: Record<string, unknown> | undefined,
  path: string
): string[] {
  const result = getValue(value, path);
  return Array.isArray(result) ? result.filter((item): item is string => typeof item === "string") : [];
}

function getValue(value: Record<string, unknown> | undefined, path: string): unknown {
  if (!value) {
    return undefined;
  }

  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, value);
}
