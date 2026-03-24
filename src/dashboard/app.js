const stateChip = document.getElementById("global-state-chip");
const connectionText = document.getElementById("connection-text");
const platformText = document.getElementById("platform-text");
const eventCountText = document.getElementById("event-count-text");
const threadsList = document.getElementById("threads-list");
const threadsEmpty = document.getElementById("threads-empty");
const eventsSubtitle = document.getElementById("events-subtitle");
const eventsEmpty = document.getElementById("events-empty");
const eventsList = document.getElementById("events-list");
const promptForm = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt-input");
const promptSubmit = document.getElementById("prompt-submit");
const formStatus = document.getElementById("form-status");
let lastSnapshot = null;
let selectedThreadKey = null;

connect();
loadInitialState();

promptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();

  if (!prompt) {
    formStatus.textContent = "请输入 Prompt。";
    return;
  }

  promptSubmit.disabled = true;
  formStatus.textContent = "启动中...";

  try {
    const response = await fetch("/api/prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "启动失败。");
    }

    formStatus.textContent = `已启动任务 ${payload.turnId}`;
  } catch (error) {
    formStatus.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    promptSubmit.disabled = false;
  }
});

async function loadInitialState() {
  const response = await fetch("/api/state");
  const snapshot = await response.json();
  render(snapshot);
}

function connect() {
  const source = new EventSource("/events");

  source.addEventListener("snapshot", (event) => {
    render(JSON.parse(event.data));
  });

  source.onerror = () => {
    connectionText.textContent = "已断开";
  };
}

function render(snapshot) {
  lastSnapshot = snapshot;
  const monitor = snapshot.monitor;
  const connection = snapshot.connection;

  stateChip.textContent = formatStateLabel(monitor.currentState);
  stateChip.dataset.state = monitor.currentState;
  connectionText.textContent = connection.connected
    ? connection.initialized
      ? "已就绪"
      : "已连接"
    : "离线";
  platformText.textContent = `${connection.mode} / ${monitor.serverPlatform || "未知"}`;
  eventCountText.textContent = String(monitor.totalEvents);

  renderThreads(monitor.threads);
  renderEvents(monitor.recentEvents, monitor.threads);
}

function renderThreads(threads) {
  const selectedThreadStillExists = threads.some((thread) => getThreadKey(thread) === selectedThreadKey);
  if (!selectedThreadStillExists) {
    selectedThreadKey = null;
  }

  threadsList.innerHTML = "";
  threadsEmpty.hidden = threads.length > 0;

  for (const thread of threads) {
    const article = document.createElement("article");
    article.className = "thread-card";
    const threadKey = getThreadKey(thread);
    if (threadKey === selectedThreadKey) {
      article.classList.add("is-selected");
    }

    article.innerHTML = `
      <header>
        <div class="thread-meta">
          <span class="thread-state" data-state="${thread.displayState}">${formatStateLabel(thread.displayState)}</span>
          <code>${thread.threadId}</code>
        </div>
        <span class="thread-status">${formatStatusLabel(thread.status)}</span>
      </header>
      <dl>
        <div>
          <dt>基础状态</dt>
          <dd>${formatStateLabel(thread.baseState)}</dd>
        </div>
        <div>
          <dt>任务轮次</dt>
          <dd>${thread.currentTurnId || "-"}</dd>
        </div>
        <div>
          <dt>最近事件</dt>
          <dd>${formatEventKind(thread.lastEventKind)}</dd>
        </div>
        <div>
          <dt>附加标记</dt>
          <dd>${thread.activeFlags.length ? thread.activeFlags.join(", ") : "-"}</dd>
        </div>
        <div>
          <dt>预览文本</dt>
          <dd>${escapeHtml(thread.lastPreview || "-")}</dd>
        </div>
        <div>
          <dt>最近增量</dt>
          <dd>${escapeHtml(thread.lastDelta || "-")}</dd>
        </div>
      </dl>
    `;

    article.addEventListener("click", () => {
      selectedThreadKey = selectedThreadKey === threadKey ? null : threadKey;
      if (lastSnapshot) {
        render(lastSnapshot);
      }
    });

    threadsList.appendChild(article);
  }
}

function renderEvents(events, threads) {
  const activeThread = selectedThreadKey
    ? threads.find((thread) => getThreadKey(thread) === selectedThreadKey) || null
    : null;
  const filteredEvents = activeThread
    ? events.filter((event) => getEventThreadKey(event) === selectedThreadKey)
    : events;

  eventsList.innerHTML = "";
  eventsEmpty.hidden = filteredEvents.length > 0;
  eventsSubtitle.textContent = activeThread
    ? `当前仅展示线程 ${formatShortId(activeThread.threadId)} 的最近事件。再次点击线程卡可取消筛选。`
    : "按时间倒序展示最新的归一化事件。点击左侧线程卡可只看对应线程。";

  for (const event of filteredEvents.slice(0, 40)) {
    const article = document.createElement("article");
    article.className = "event-card";
    if (activeThread && getEventThreadKey(event) === selectedThreadKey) {
      article.classList.add("is-matched");
    }

    article.innerHTML = `
      <div class="event-line">
        <span class="event-kind">${formatEventKind(event.kind)}</span>
        <time>${new Date(event.timestamp).toLocaleTimeString()}</time>
      </div>
      <div class="event-tags">
        ${event.stateHint ? `<span data-state="${event.stateHint}">${formatStateLabel(event.stateHint)}</span>` : ""}
        ${event.itemType ? `<span>${formatItemType(event.itemType)}</span>` : ""}
        ${event.status ? `<span>${formatStatusLabel(event.status)}</span>` : ""}
      </div>
      <div class="event-detail">
        ${escapeHtml(
          event.delta ||
          event.preview ||
          event.error ||
          event.requestMethod ||
          event.threadId ||
          "-"
        )}
      </div>
    `;

    eventsList.appendChild(article);
  }
}

function getThreadKey(thread) {
  return `${thread.sourceId || "local"}:${thread.threadId}`;
}

function getEventThreadKey(event) {
  if (!event.threadId) {
    return null;
  }

  return `${event.sourceId || "local"}:${event.threadId}`;
}

function formatShortId(value) {
  if (!value) {
    return "-";
  }

  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatStateLabel(state) {
  const labels = {
    idle: "空闲",
    thinking: "思考中",
    typing: "输出中",
    working: "执行中",
    editing: "修改中",
    subagent_one: "单代理",
    subagent_many: "多代理",
    approval: "待审批",
    error: "错误",
    success: "完成",
    sleeping: "休眠"
  };

  return labels[state] || state;
}

function formatStatusLabel(status) {
  const labels = {
    active: "活跃",
    idle: "空闲",
    completed: "已完成",
    failed: "失败",
    inProgress: "进行中",
    systemError: "系统错误"
  };

  if (!status) {
    return "未知";
  }

  return labels[status] || status;
}

function formatItemType(itemType) {
  const labels = {
    userMessage: "用户消息",
    reasoning: "推理",
    agentMessage: "助手消息",
    commandExecution: "命令执行",
    fileChange: "文件修改",
    mcpToolCall: "MCP 工具",
    dynamicToolCall: "动态工具",
    collabAgentToolCall: "协作代理",
    plan: "计划"
  };

  return labels[itemType] || itemType;
}

function formatEventKind(kind) {
  const labels = {
    "lifecycle.connected": "已连接服务",
    "server.initialized": "服务已初始化",
    "thread.started": "线程已创建",
    "thread.status.changed": "线程状态变化",
    "turn.started": "任务开始",
    "turn.completed": "任务结束",
    "item.started": "条目开始",
    "item.completed": "条目结束",
    "item.agentMessage.delta": "回复增量",
    "item.reasoning.delta": "推理增量",
    "item.reasoning.summary.delta": "推理摘要增量",
    "item.commandExecution.output.delta": "命令输出增量",
    "item.fileChange.output.delta": "文件修改增量",
    "server.request": "服务端请求",
    "server.error": "服务端错误"
  };

  return labels[kind] || kind;
}
