import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray
} from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CodexRuntime } from "./runtime.js";
import { SettingsStore, type PersistedSettings, type SizeKey } from "./settingsStore.js";
import { DashboardServer } from "../main/dashboard/dashboardServer.js";
import type {
  AppearanceConfig,
  BubbleConfig,
  BubbleDetailMode,
  BubbleRenderMeta,
  DesktopPetSnapshot,
  DeskPetState
} from "../shared/types.js";
type PetState =
  | "disconnected"
  | "idle"
  | "yawning"
  | "dozing"
  | "sleeping"
  | "waking"
  | "mini-idle"
  | "mini-peek"
  | "mini-alert"
  | "mini-happy"
  | "mini-sleep"
  | "thinking"
  | "working"
  | "juggling"
  | "notification"
  | "error"
  | "attention"
  | "carrying";

interface PetPresentation {
  state: PetState;
  svg: string;
}

interface HitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "../../..");
const rendererEntry = join(projectRoot, "src/electron/renderer/index.html");
const preloadEntry = join(__dirname, "preload.js");

const isMac = process.platform === "darwin";

const SIZES: Record<SizeKey, { width: number; height: number }> = {
  S: { width: 200, height: 200 },
  M: { width: 280, height: 280 },
  L: { width: 360, height: 360 }
};

const BUBBLE_EXTRA_HEIGHT: Record<BubbleDetailMode, number> = {
  basic: 0,
  detailed: 68
};
const BUBBLE_SPACING_BASELINE_SHIFT_PX = 60;
const DEFAULT_BUBBLE_SPACING_PX = 0;
const MIN_BUBBLE_SPACING_PX = -20;
const MAX_BUBBLE_SPACING_PX = 180;

const SVG_IDLE_FOLLOW = "clawd-idle-follow.svg";
const SVG_IDLE_LOOK = "clawd-idle-look.svg";

const HIT_BOXES: Record<"default" | "sleeping" | "wide", HitBox> = {
  default: { x: -1, y: 5, w: 17, h: 12 },
  sleeping: { x: -2, y: 9, w: 19, h: 7 },
  wide: { x: -3, y: 3, w: 21, h: 14 }
};

const WIDE_SVGS = new Set([
  "clawd-error.svg",
  "clawd-working-building.svg",
  "clawd-notification.svg",
  "clawd-working-conducting.svg"
]);

const MOUSE_IDLE_TIMEOUT = 20_000;
const MOUSE_SLEEP_TIMEOUT = 60_000;
const IDLE_LOOK_DURATION = 10_000;
const YAWN_DURATION = 3_000;
const WAKE_DURATION = 1_500;
const SNAP_TOLERANCE = 30;
const MINI_OFFSET_RATIO = 0.486;
const PEEK_OFFSET = 25;

const OBJ_SCALE_W = 1.9;
const OBJ_SCALE_H = 1.3;
const OBJ_OFF_X = -0.45;
const OBJ_OFF_Y = -0.25;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentSize: SizeKey = "M";
let latestSnapshot!: DesktopPetSnapshot;
let currentPresentation: PetPresentation = {
  state: "disconnected",
  svg: "clawd-disconnected.svg"
};
let currentHitBox: HitBox = HIT_BOXES.default;
let dragLocked = false;
let cursorPollingPaused = false;
let mouseOverPet = false;
let miniMode = false;
let miniPeeked = false;
let preMiniBounds: Electron.Rectangle | null = null;
let mainTickTimer: NodeJS.Timeout | null = null;
let wakePollTimer: NodeJS.Timeout | null = null;
let idleLookTimer: NodeJS.Timeout | null = null;
let yawnTimer: NodeJS.Timeout | null = null;
let wakeTimer: NodeJS.Timeout | null = null;
let lastCursorX: number | null = null;
let lastCursorY: number | null = null;
let mouseStillSince = Date.now();
let isMouseIdle = false;
let idleLookPlayed = false;
let lastEyeDx = 0;
let lastEyeDy = 0;
let forceEyeResend = false;
let debugStateOverride: DeskPetState | null = null;
let bubbleVisible = true;
let bubbleDetailMode: BubbleDetailMode = "basic";
let bubbleSpacingPx = DEFAULT_BUBBLE_SPACING_PX;
let accentColor: string | undefined;
let runtime!: CodexRuntime;
let settingsStore!: SettingsStore;
let dashboardServer: DashboardServer | null = null;
let dashboardPort: number | null = null;
const configuredExternalUrl = process.env.CODEX_APP_SERVER_URL?.trim();
const configuredExternalUrls = [
  ...(process.env.CODEX_APP_SERVER_URLS ?? "").split(/[\n,]/).map((value) => value.trim()),
  configuredExternalUrl ?? ""
].filter(Boolean);
const ACCENT_PRESETS = [
  { label: "默认蓝紫", value: undefined },
  { label: "珊瑚橙", value: "#ff7a59" },
  { label: "森林绿", value: "#35b56a" },
  { label: "玫红", value: "#e85d92" },
  { label: "琥珀", value: "#d69a2d" }
] as const;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.whenReady().then(async () => {
  settingsStore = new SettingsStore(join(app.getPath("userData"), "settings.json"));
  const persistedSettings = await settingsStore.load();
  applyPersistedSettings(persistedSettings);
  runtime = new CodexRuntime(projectRoot, getInitialRuntimeConfig(persistedSettings));
  latestSnapshot = runtime.getSnapshot();

  createWindow();
  createTray();
  registerIpc();
  startMainTick();

  runtime.onSnapshot((snapshot) => {
    latestSnapshot = snapshot;
    refreshFromRuntime();
    updateTrayMenu(snapshot);
  });

  await runtime.start();
  refreshFromRuntime();
});

async function shutdown(): Promise<void> {
  stopMainTick();
  await dashboardServer?.stop();
  dashboardServer = null;
  dashboardPort = null;
  await runtime.stop();
  app.quit();
}

function createWindow(): void {
  const display = screen.getPrimaryDisplay();
  const { width, height } = getWindowSize(currentSize);
  const x = Math.round(display.workArea.x + display.workArea.width - width - 28);
  const y = Math.round(display.workArea.y + display.workArea.height - height - 36);

  const window = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadEntry,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void window.loadFile(rendererEntry);
  window.webContents.on("did-finish-load", () => {
    sendCurrentPresentation();
  });

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    window.hide();
  });

  mainWindow = window;
}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(
    join(
      projectRoot,
      "src/electron/assets",
      isMac ? "tray-iconTemplate.png" : "tray-icon.png"
    )
  );

  tray = new Tray(trayIcon.resize({ width: 18, height: 18 }));
  tray.setToolTip("Codex on Desk");
  tray.on("double-click", () => {
    toggleWindowVisibility();
  });

  updateTrayMenu(latestSnapshot);
}

function updateTrayMenu(snapshot: DesktopPetSnapshot): void {
  if (!tray) {
    return;
  }

  const sizeMenu: Electron.MenuItemConstructorOptions[] = (["S", "M", "L"] as SizeKey[]).map(
    (size) => ({
      label: `大小 ${size}`,
      type: "radio",
      checked: currentSize === size,
      click: () => {
        setWindowSize(size);
      }
    })
  );

  const debugStates: DeskPetState[] = [
    "idle",
    "thinking",
    "typing",
    "working",
    "editing",
    "approval",
    "success",
    "error",
    "sleeping"
  ];

  const debugMenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: "自动",
      type: "radio",
      checked: debugStateOverride === null,
      click: () => {
        debugStateOverride = null;
        refreshFromRuntime();
        updateTrayMenu(latestSnapshot);
      }
    },
    ...debugStates.map((state) => ({
      label: formatDeskState(state),
      type: "radio" as const,
      checked: debugStateOverride === state,
      click: () => {
        debugStateOverride = state;
        refreshFromRuntime();
        updateTrayMenu(latestSnapshot);
      }
    }))
  ];

  const externalUrls = snapshot.connection.listenUrls?.length
    ? snapshot.connection.listenUrls
    : configuredExternalUrls;
  const externalUrl = externalUrls[0];
  const appearanceMenu: Electron.MenuItemConstructorOptions[] = [
    ...ACCENT_PRESETS.map((preset) => ({
      label: preset.label,
      type: "radio" as const,
      checked: accentColor === preset.value || (!accentColor && typeof preset.value === "undefined"),
      click: () => {
        void setAccentColor(preset.value);
      }
    })),
    {
      label: "自定义色值...",
      click: () => {
        sendToRenderer("request-accent-color-input", accentColor);
      }
    }
  ];
  const connectionMenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: "自动发现当前 Codex",
      type: "radio",
      checked: snapshot.connection.mode === "auto",
      click: () => {
        void setConnectionMode("auto");
      }
    },
    {
      label: "自动托管",
      type: "radio",
      checked: snapshot.connection.mode === "managed",
      click: () => {
        void setConnectionMode("managed");
      }
    },
    {
      label:
        externalUrls.length > 0
          ? `外部连接（${externalUrls.length} 个地址）`
          : "外部连接（需设置 CODEX_APP_SERVER_URL 或 CODEX_APP_SERVER_URLS）",
      type: "radio",
      checked: snapshot.connection.mode === "external",
      enabled: externalUrls.length > 0,
      click: () => {
        if (!externalUrl) {
          return;
        }
        void setConnectionMode("external", externalUrl);
      }
    }
  ];

  const menu = Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? "隐藏桌宠" : "显示桌宠",
      click: () => {
        toggleWindowVisibility();
      }
    },
    {
      label: "在浏览器中打开状态看板",
      click: () => {
        void openDashboardInBrowser();
      }
    },
    {
      label: "显示状态对话框",
      type: "checkbox",
      checked: bubbleVisible,
      click: () => {
        setBubbleVisible(!bubbleVisible);
      }
    },
    {
      label: "对话框信息",
      submenu: [
        {
          label: "简略",
          type: "radio",
          checked: bubbleDetailMode === "basic",
          click: () => {
            setBubbleDetailMode("basic");
          }
        },
        {
          label: "详细",
          type: "radio",
          checked: bubbleDetailMode === "detailed",
          click: () => {
            setBubbleDetailMode("detailed");
          }
        }
      ]
    },
    {
      label: "对话框距离",
      submenu: [
        {
          label: `当前 ${bubbleSpacingPx}px`,
          enabled: false
        },
        {
          label: "减少 10px",
          click: () => {
            setBubbleSpacing(bubbleSpacingPx - 10);
          }
        },
        {
          label: "增加 10px",
          click: () => {
            setBubbleSpacing(bubbleSpacingPx + 10);
          }
        },
        {
          label: "重置",
          enabled: bubbleSpacingPx !== DEFAULT_BUBBLE_SPACING_PX,
          click: () => {
            setBubbleSpacing(DEFAULT_BUBBLE_SPACING_PX);
          }
        },
        {
          label: "自定义输入...",
          click: () => {
            void promptForBubbleSpacing();
          }
        }
      ]
    },
    {
      label: "大小",
      submenu: sizeMenu
    },
    {
      label: "主题颜色",
      submenu: appearanceMenu
    },
    {
      label: "调试状态",
      submenu: debugMenu
    },
    {
      label: "连接模式",
      submenu: connectionMenu
    },
    {
      label: "运行测试 Prompt",
      enabled: snapshot.connection.mode === "managed",
      click: () => {
        void runtime.runPrompt("只回复 OK。");
      }
    },
    { type: "separator" },
    {
      label: `状态: ${formatDeskState(snapshot.monitor.currentState)}`
    },
    {
      label:
        snapshot.connection.totalSources && snapshot.connection.totalSources > 1
          ? `连接: ${snapshot.connection.mode} / ${snapshot.connection.connectedSources ?? 0}/${snapshot.connection.totalSources} connected`
          : `连接: ${snapshot.connection.mode} / ${snapshot.connection.connected ? "connected" : "disconnected"}`
    },
    {
      label:
        snapshot.connection.mode === "auto"
          ? `发现源: ${snapshot.connection.connectedSources ?? 0}`
          : snapshot.connection.totalSources && snapshot.connection.totalSources > 1
          ? `地址: ${externalUrls.join(", ")}`
          : `地址: ${snapshot.connection.listenUrl ?? externalUrl ?? "managed auto"}`
    },
    {
      label:
        snapshot.runtimeStatus === "error"
          ? `连接错误: ${snapshot.errorMessage ?? snapshot.connection.errorMessage ?? "unknown"}`
          : `平台: ${snapshot.monitor.serverPlatform ?? "unknown"}`
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        void shutdown();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

function registerIpc(): void {
  ipcMain.handle("codex:getSnapshot", () => latestSnapshot);
  ipcMain.handle("codex:getBubbleConfig", () => getBubbleConfig());
  ipcMain.handle("codex:getAppearanceConfig", () => getAppearanceConfig());
  ipcMain.handle("codex:setAccentColor", async (_event, nextColor?: string) => {
    await setAccentColor(nextColor);
  });
  ipcMain.handle("codex:setBubbleSpacing", async (_event, spacingPx: number) => {
    await setBubbleSpacing(spacingPx);
  });
  ipcMain.handle("codex:runPrompt", async (_event, prompt: string) => {
    return await runtime.runPrompt(prompt);
  });

  ipcMain.on("show-context-menu", () => {
    if (!mainWindow) {
      return;
    }
    tray?.popUpContextMenu();
  });

  ipcMain.on("move-window-by", (_event, dx: number, dy: number) => {
    if (!mainWindow) {
      return;
    }
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({
      ...bounds,
      x: bounds.x + dx,
      y: bounds.y + dy
    });
  });

  ipcMain.on("drag-lock", (_event, locked: boolean) => {
    dragLocked = locked;
    if (!mainWindow) {
      return;
    }

    if (locked) {
      if (miniMode) {
        releaseMiniModeForDrag();
      }
      mainWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.on("drag-end", () => {
    if (!mainWindow || miniMode) {
      return;
    }

    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const rightEdge = display.workArea.x + display.workArea.width;
    if (bounds.x + bounds.width >= rightEdge - SNAP_TOLERANCE) {
      enterMiniMode();
    }
  });

  ipcMain.on("pause-cursor-polling", () => {
    cursorPollingPaused = true;
  });

  ipcMain.on("resume-from-reaction", () => {
    cursorPollingPaused = false;
    forceEyeResend = true;
    sendCurrentPresentation();
  });
}

function refreshFromRuntime(): void {
  const effectiveSnapshot = getEffectiveSnapshot(latestSnapshot);

  if (effectiveSnapshot.runtimeStatus !== "ready") {
    clearIdleSequence();
    applyPresentation({ state: "disconnected", svg: "clawd-disconnected.svg" });
    return;
  }

  if (miniMode) {
    clearIdleSequence();
    applyPresentation(mapSnapshotToMiniPresentation(effectiveSnapshot));
    return;
  }

  const presentation = mapSnapshotToPresentation(effectiveSnapshot);
  if (presentation.state !== "idle") {
    clearIdleSequence();
    applyPresentation(presentation);
    return;
  }

  if (!isIdleFamilyState(currentPresentation.state)) {
    resetIdleTracking();
    applyPresentation({ state: "idle", svg: SVG_IDLE_FOLLOW });
  }
}

function mapSnapshotToPresentation(snapshot: DesktopPetSnapshot): PetPresentation {
  const state = snapshot.monitor.currentState;
  const busyThreadCount = snapshot.monitor.threads.filter((thread) =>
    ["thinking", "typing", "working", "editing", "subagent_one", "subagent_many"].includes(
      thread.displayState
    )
  ).length;

  switch (state) {
    case "thinking":
      return {
        state: "thinking",
        svg: busyThreadCount >= 3 ? "clawd-working-ultrathink.svg" : "clawd-working-thinking.svg"
      };
    case "typing":
      return { state: "working", svg: "clawd-working-typing.svg" };
    case "working":
      return {
        state: "working",
        svg: busyThreadCount >= 2 ? "clawd-working-building.svg" : "clawd-working-typing.svg"
      };
    case "editing":
      return { state: "carrying", svg: "clawd-working-carrying.svg" };
    case "subagent_one":
      return { state: "juggling", svg: "clawd-working-juggling.svg" };
    case "subagent_many":
      return { state: "juggling", svg: "clawd-working-conducting.svg" };
    case "approval":
      return { state: "notification", svg: "clawd-notification.svg" };
    case "error":
      return { state: "error", svg: "clawd-error.svg" };
    case "success":
      return { state: "attention", svg: "clawd-happy.svg" };
    case "sleeping":
      return { state: "sleeping", svg: "clawd-sleeping.svg" };
    case "idle":
    default:
      return { state: "idle", svg: SVG_IDLE_FOLLOW };
  }
}

function getEffectiveSnapshot(snapshot: DesktopPetSnapshot): DesktopPetSnapshot {
  if (debugStateOverride === null) {
    return snapshot;
  }

  return {
    ...snapshot,
    monitor: {
      ...snapshot.monitor,
      currentState: debugStateOverride
    }
  };
}

function mapSnapshotToMiniPresentation(snapshot: DesktopPetSnapshot): PetPresentation {
  const state = snapshot.monitor.currentState;

  if (snapshot.runtimeStatus !== "ready") {
    return { state: "disconnected", svg: "clawd-disconnected.svg" };
  }

  if (state === "approval" || state === "error") {
    return { state: "mini-alert", svg: "clawd-mini-alert.svg" };
  }

  if (state === "success") {
    return { state: "mini-happy", svg: "clawd-mini-happy.svg" };
  }

  if (state === "sleeping") {
    return { state: "mini-sleep", svg: "clawd-mini-sleep.svg" };
  }

  if (mouseOverPet || miniPeeked) {
    return { state: "mini-peek", svg: "clawd-mini-peek.svg" };
  }

  return { state: "mini-idle", svg: "clawd-mini-idle.svg" };
}

function applyPresentation(next: PetPresentation): void {
  if (next.state === currentPresentation.state && next.svg === currentPresentation.svg) {
    return;
  }

  currentPresentation = next;
  currentHitBox = getHitBoxForSvg(next.svg);

  if (next.state !== "idle") {
    sendToRenderer("eye-move", 0, 0);
  }

  if (next.state === "dozing" || next.state === "sleeping") {
    startWakePoll();
  } else {
    stopWakePoll();
  }

  sendCurrentPresentation();
}

function sendCurrentPresentation(): void {
  sendToRenderer(
    "state-change",
    currentPresentation.state,
    currentPresentation.svg,
    buildBubbleRenderMeta(getEffectiveSnapshot(latestSnapshot))
  );
  sendToRenderer("size-change", currentSize);
  sendToRenderer("bubble-config-change", getBubbleConfig());
  sendToRenderer("appearance-config-change", getAppearanceConfig());
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, ...args);
}

function setBubbleVisible(visible: boolean): void {
  bubbleVisible = visible;
  updateWindowLayout();
  updateTrayMenu(latestSnapshot);
  sendToRenderer("bubble-config-change", getBubbleConfig());
  void persistSettings();
}

function setBubbleDetailMode(detailMode: BubbleDetailMode): void {
  bubbleDetailMode = detailMode;
  updateWindowLayout();
  updateTrayMenu(latestSnapshot);
  sendToRenderer("state-change", currentPresentation.state, currentPresentation.svg, buildBubbleRenderMeta(getEffectiveSnapshot(latestSnapshot)));
  sendToRenderer("bubble-config-change", getBubbleConfig());
  void persistSettings();
}

async function setBubbleSpacing(nextSpacingPx: number): Promise<void> {
  bubbleSpacingPx = normalizeBubbleSpacing(nextSpacingPx);
  updateWindowLayout();
  updateTrayMenu(latestSnapshot);
  sendToRenderer("bubble-config-change", getBubbleConfig());
  await persistSettings();
}

function getBubbleConfig(): BubbleConfig {
  return {
    visible: bubbleVisible,
    detailMode: bubbleDetailMode,
    spacingPx: bubbleSpacingPx
  };
}

function getAppearanceConfig(): AppearanceConfig {
  return {
    accentColor
  };
}

function buildBubbleRenderMeta(snapshot: DesktopPetSnapshot): BubbleRenderMeta {
  if (bubbleDetailMode !== "detailed") {
    return {};
  }

  const [thread] = snapshot.monitor.threads;
  if (!thread) {
    return {};
  }

  const detailParts = [
    thread.sourceLabel ? `来源 ${formatBubbleSource(thread.sourceLabel)}` : undefined,
    `线程 ${formatShortId(thread.threadId)}`,
    `事件 ${formatEventLabel(thread.lastEventKind)}`
  ].filter((value): value is string => Boolean(value));

  return {
    detailOverride: detailParts.join(" | ")
  };
}

function startMainTick(): void {
  if (mainTickTimer) {
    return;
  }

  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  mainTickTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();

    if (!dragLocked) {
      const hit = getHitRectScreen(bounds);
      const over =
        cursor.x >= hit.left &&
        cursor.x <= hit.right &&
        cursor.y >= hit.top &&
        cursor.y <= hit.bottom;

      if (over !== mouseOverPet) {
        mouseOverPet = over;
        mainWindow.setIgnoreMouseEvents(!over, { forward: true });
      }
    }

    if (cursorPollingPaused) {
      return;
    }

    if (miniMode) {
      const miniBase = mapSnapshotToMiniPresentation(latestSnapshot);

      if (miniBase.state === "mini-idle" || miniBase.state === "mini-peek") {
        if (mouseOverPet && !miniPeeked) {
          miniPeeked = true;
          setMiniBounds(true);
          applyPresentation({ state: "mini-peek", svg: "clawd-mini-peek.svg" });
        } else if (!mouseOverPet && miniPeeked) {
          miniPeeked = false;
          setMiniBounds(false);
          applyPresentation({ state: "mini-idle", svg: "clawd-mini-idle.svg" });
        }
      } else {
        applyPresentation(miniBase);
      }

      if (
        currentPresentation.svg !== "clawd-mini-idle.svg" &&
        currentPresentation.svg !== "clawd-mini-peek.svg"
      ) {
        return;
      }
    }

    const base = miniMode
      ? mapSnapshotToMiniPresentation(latestSnapshot)
      : mapSnapshotToPresentation(latestSnapshot);
    if (base.state !== "idle") {
      if (!miniMode) {
        return;
      }
    }

    if (miniMode) {
      if (currentPresentation.svg !== "clawd-mini-idle.svg" && currentPresentation.svg !== "clawd-mini-peek.svg") {
        return;
      }
    }

    const moved = lastCursorX !== null && (cursor.x !== lastCursorX || cursor.y !== lastCursorY);
    lastCursorX = cursor.x;
    lastCursorY = cursor.y;

    if (isSleepSequenceState(currentPresentation.state)) {
      return;
    }

    if (moved) {
      mouseStillSince = Date.now();
      idleLookPlayed = false;
      clearIdleLookTimer();
      if (currentPresentation.state === "idle" && currentPresentation.svg !== SVG_IDLE_FOLLOW) {
        applyPresentation({ state: "idle", svg: SVG_IDLE_FOLLOW });
        forceEyeResend = true;
      }
    }

    const elapsed = Date.now() - mouseStillSince;

    if (!miniMode && elapsed >= MOUSE_SLEEP_TIMEOUT && currentPresentation.state === "idle") {
      clearIdleLookTimer();
      if (!yawnTimer) {
        applyPresentation({ state: "yawning", svg: "clawd-idle-yawn.svg" });
        yawnTimer = setTimeout(() => {
          yawnTimer = null;
          if (mapSnapshotToPresentation(latestSnapshot).state === "idle") {
            applyPresentation({ state: "dozing", svg: "clawd-idle-doze.svg" });
          }
        }, YAWN_DURATION);
      }
      return;
    }

    if (
      !idleLookPlayed &&
      !miniMode &&
      elapsed >= MOUSE_IDLE_TIMEOUT &&
      currentPresentation.state === "idle" &&
      currentPresentation.svg === SVG_IDLE_FOLLOW
    ) {
      idleLookPlayed = true;
      applyPresentation({ state: "idle", svg: SVG_IDLE_LOOK });
      idleLookTimer = setTimeout(() => {
        idleLookTimer = null;
        if (mapSnapshotToPresentation(latestSnapshot).state === "idle") {
          applyPresentation({ state: "idle", svg: SVG_IDLE_FOLLOW });
          forceEyeResend = true;
        }
      }, IDLE_LOOK_DURATION);
      return;
    }

    if (
      currentPresentation.svg !== SVG_IDLE_FOLLOW &&
      currentPresentation.svg !== "clawd-mini-idle.svg" &&
      currentPresentation.svg !== "clawd-mini-peek.svg"
    ) {
      return;
    }

    if (!moved && !forceEyeResend) {
      return;
    }

    const obj = getObjRect(bounds);
    const eyeScreenX = obj.x + obj.w * (22 / 45);
    const eyeScreenY = obj.y + obj.h * (34 / 45);
    const relX = cursor.x - eyeScreenX;
    const relY = cursor.y - eyeScreenY;

    const maxOffset = 3;
    const dist = Math.sqrt(relX * relX + relY * relY);
    let eyeDx = 0;
    let eyeDy = 0;

    if (dist > 1) {
      const scale = Math.min(1, dist / 300);
      eyeDx = (relX / dist) * maxOffset * scale;
      eyeDy = (relY / dist) * maxOffset * scale;
    }

    eyeDx = Math.round(eyeDx * 2) / 2;
    eyeDy = Math.round(eyeDy * 2) / 2;
    eyeDy = Math.max(-1.5, Math.min(1.5, eyeDy));

    if (forceEyeResend || eyeDx !== lastEyeDx || eyeDy !== lastEyeDy) {
      forceEyeResend = false;
      lastEyeDx = eyeDx;
      lastEyeDy = eyeDy;
      sendToRenderer("eye-move", eyeDx, eyeDy);
    }
  }, 50);
}

function stopMainTick(): void {
  if (mainTickTimer) {
    clearInterval(mainTickTimer);
    mainTickTimer = null;
  }
  stopWakePoll();
  clearIdleSequence();
}

function startWakePoll(): void {
  if (wakePollTimer) {
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  let lastWakeCursorX = cursor.x;
  let lastWakeCursorY = cursor.y;

  wakePollTimer = setInterval(() => {
    const point = screen.getCursorScreenPoint();
    const moved = point.x !== lastWakeCursorX || point.y !== lastWakeCursorY;
    lastWakeCursorX = point.x;
    lastWakeCursorY = point.y;

    if (!moved) {
      return;
    }

    stopWakePoll();
    wakeFromDoze();
  }, 200);
}

function stopWakePoll(): void {
  if (wakePollTimer) {
    clearInterval(wakePollTimer);
    wakePollTimer = null;
  }
}

function wakeFromDoze(): void {
  if (currentPresentation.state !== "dozing" && currentPresentation.state !== "sleeping") {
    return;
  }

  const fromState = currentPresentation.state;

  if (fromState === "dozing") {
    sendToRenderer("wake-from-doze");
  } else {
    applyPresentation({ state: "waking", svg: "clawd-wake.svg" });
  }

  if (wakeTimer) {
    clearTimeout(wakeTimer);
  }

  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    mouseStillSince = Date.now();
    idleLookPlayed = false;
    forceEyeResend = true;
    refreshFromRuntime();
  }, fromState === "sleeping" ? WAKE_DURATION : 350);
}

function clearIdleSequence(): void {
  clearIdleLookTimer();
  if (yawnTimer) {
    clearTimeout(yawnTimer);
    yawnTimer = null;
  }
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  stopWakePoll();
  resetIdleTracking();
}

function clearIdleLookTimer(): void {
  if (idleLookTimer) {
    clearTimeout(idleLookTimer);
    idleLookTimer = null;
  }
}

function resetIdleTracking(): void {
  mouseStillSince = Date.now();
  isMouseIdle = false;
  idleLookPlayed = false;
  lastCursorX = null;
  lastCursorY = null;
  lastEyeDx = 0;
  lastEyeDy = 0;
}

function isSleepSequenceState(state: PetState): boolean {
  return state === "yawning" || state === "dozing" || state === "sleeping" || state === "waking";
}

function isIdleFamilyState(state: PetState): boolean {
  return state === "idle" || isSleepSequenceState(state);
}

function toggleWindowVisibility(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

async function openDashboardInBrowser(): Promise<void> {
  const url = await ensureDashboardServer();
  if (!url) {
    return;
  }

  try {
    await shell.openExternal(url);
  } catch (error) {
    const options = {
      type: "error",
      message: "无法在默认浏览器中打开状态看板",
      detail: error instanceof Error ? error.message : String(error)
    } as const;
    if (mainWindow) {
      await dialog.showMessageBox(mainWindow, options);
    } else {
      await dialog.showMessageBox(options);
    }
  }
}

async function ensureDashboardServer(): Promise<string | null> {
  if (dashboardPort !== null) {
    return `http://127.0.0.1:${dashboardPort}`;
  }

  if (!dashboardServer) {
    dashboardServer = new DashboardServer({
      staticRoot: projectRoot,
      runtime,
      port: 0
    });
  }

  try {
    const started = await dashboardServer.start();
    dashboardPort = started.port;
    return `http://127.0.0.1:${dashboardPort}`;
  } catch (error) {
    dashboardServer = null;
    dashboardPort = null;
    const options = {
      type: "error",
      message: "状态看板启动失败",
      detail: error instanceof Error ? error.message : String(error)
    } as const;
    if (mainWindow) {
      await dialog.showMessageBox(mainWindow, options);
    } else {
      await dialog.showMessageBox(options);
    }
    return null;
  }
}

function enterMiniMode(): void {
  if (!mainWindow || miniMode) {
    return;
  }

  miniMode = true;
  miniPeeked = false;
  preMiniBounds = mainWindow.getBounds();
  setMiniBounds(false);
  refreshFromRuntime();
}

function exitMiniMode(): void {
  if (!mainWindow || !miniMode) {
    return;
  }

  miniMode = false;
  miniPeeked = false;

  if (preMiniBounds) {
    mainWindow.setBounds(preMiniBounds);
  }

  refreshFromRuntime();
}

function releaseMiniModeForDrag(): void {
  if (!mainWindow || !miniMode) {
    return;
  }

  miniMode = false;
  miniPeeked = false;
  preMiniBounds = null;
  refreshFromRuntime();
}

function setMiniBounds(peek: boolean): void {
  if (!mainWindow) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const hiddenX =
    display.workArea.x +
    display.workArea.width -
    Math.round(bounds.width * MINI_OFFSET_RATIO);

  mainWindow.setBounds({
    ...bounds,
    x: peek ? hiddenX - PEEK_OFFSET : hiddenX,
    y: bounds.y
  });
}

function setWindowSize(size: SizeKey): void {
  if (!mainWindow) {
    currentSize = size;
    void persistSettings();
    return;
  }

  const currentBounds = mainWindow.getBounds();
  const next = getWindowSize(size);
  currentSize = size;

  const x = Math.round(currentBounds.x + currentBounds.width / 2 - next.width / 2);
  const y = Math.round(currentBounds.y + currentBounds.height / 2 - next.height / 2);

  mainWindow.setBounds({
    x,
    y,
    width: next.width,
    height: next.height
  });

  if (miniMode) {
    setMiniBounds(miniPeeked);
  }

  void persistSettings();
}

function updateWindowLayout(): void {
  if (!mainWindow) {
    return;
  }

  const currentBounds = mainWindow.getBounds();
  const next = getWindowSize(currentSize);
  const x = Math.round(currentBounds.x + currentBounds.width / 2 - next.width / 2);
  const y = Math.round(currentBounds.y + currentBounds.height - next.height);

  mainWindow.setBounds({
    x,
    y,
    width: next.width,
    height: next.height
  });

  if (miniMode) {
    setMiniBounds(miniPeeked);
  }
}

function getWindowSize(size: SizeKey): { width: number; height: number } {
  const base = SIZES[size];
  return {
    width: base.width,
    height: base.height + getBubbleExtraHeight()
  };
}

function getBubbleExtraHeight(): number {
  if (!bubbleVisible) {
    return 0;
  }

  return Math.max(0, BUBBLE_EXTRA_HEIGHT[bubbleDetailMode] + bubbleSpacingPx);
}

function applyPersistedSettings(settings: PersistedSettings): void {
  currentSize = settings.size;
  bubbleVisible = settings.bubbleVisible;
  bubbleDetailMode = settings.bubbleDetailMode;
  bubbleSpacingPx = normalizeBubbleSpacing(
    settings.bubbleSpacingPx + BUBBLE_SPACING_BASELINE_SHIFT_PX
  );
  accentColor = settings.accentColor;
}

function getInitialRuntimeConfig(settings: PersistedSettings) {
  if (settings.connectionMode === "managed") {
    return { mode: "managed" as const, cwd: projectRoot };
  }

  if (settings.connectionMode === "external" && configuredExternalUrls.length > 0) {
    return { mode: "external" as const, listenUrl: configuredExternalUrls[0] };
  }

  if (process.env.CODEX_DISABLE_AUTO_DISCOVERY === "1") {
    return { mode: "managed" as const, cwd: projectRoot };
  }

  return { mode: "auto" as const };
}

async function setConnectionMode(mode: "auto" | "managed" | "external", listenUrl?: string): Promise<void> {
  if (mode === "auto") {
    await runtime.setAutoMode();
  } else if (mode === "managed") {
    await runtime.setManagedMode();
  } else {
    if (!listenUrl) {
      return;
    }
    await runtime.setExternalMode(listenUrl);
  }

  void persistSettings();
}

async function persistSettings(): Promise<void> {
  if (!settingsStore) {
    return;
  }

  await settingsStore.save({
    size: currentSize,
    bubbleVisible,
    bubbleDetailMode,
    bubbleSpacingPx,
    connectionMode: latestSnapshot?.connection.mode ?? "auto",
    accentColor
  });
}

async function setAccentColor(nextColor?: string): Promise<void> {
  const normalized = normalizeAccentColor(nextColor);
  accentColor = normalized;
  updateTrayMenu(latestSnapshot);
  sendToRenderer("appearance-config-change", getAppearanceConfig());
  await persistSettings();
}

function formatBubbleSource(sourceLabel: string): string {
  const bracketIndex = sourceLabel.indexOf(" (");
  const compact = bracketIndex > 0 ? sourceLabel.slice(0, bracketIndex) : sourceLabel;
  return compact.length <= 18 ? compact : `${compact.slice(0, 15)}...`;
}

function formatShortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatEventLabel(eventKind: string): string {
  switch (eventKind) {
    case "item.agentMessage.delta":
      return "回复";
    case "item.reasoning.delta":
      return "思考";
    case "item.started":
      return "工具开始";
    case "item.completed":
      return "工具完成";
    case "turn.started":
      return "开始";
    case "turn.completed":
      return "结束";
    case "thread.status.changed":
      return "状态变化";
    default:
      return eventKind.replace(/^notification\./, "").replaceAll(".", " ");
  }
}

function normalizeAccentColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return /^#([\da-f]{3}|[\da-f]{6})$/.test(normalized) ? normalized : undefined;
}

function normalizeBubbleSpacing(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BUBBLE_SPACING_PX;
  }

  return Math.max(MIN_BUBBLE_SPACING_PX, Math.min(MAX_BUBBLE_SPACING_PX, Math.round(value)));
}

async function promptForBubbleSpacing(): Promise<void> {
  const value = await showTextInputDialog({
    title: "设置对话框距离",
    message: `输入像素值，范围 ${MIN_BUBBLE_SPACING_PX} 到 ${MAX_BUBBLE_SPACING_PX}。负数会更靠近机器人。`,
    defaultValue: `${bubbleSpacingPx}`
  });

  if (value === null) {
    return;
  }

  const nextSpacingPx = Number(value.trim());
  if (!Number.isFinite(nextSpacingPx)) {
    if (mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: "warning",
        message: "请输入有效数字。"
      });
    }
    return;
  }

  await setBubbleSpacing(nextSpacingPx);
}

async function showTextInputDialog(options: {
  title: string;
  message: string;
  defaultValue: string;
}): Promise<string | null> {
  if (!mainWindow) {
    return null;
  }

  const promptWindow = new BrowserWindow({
    width: 380,
    height: 190,
    parent: mainWindow,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: options.title,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });

  const submitChannel = `bubble-spacing-submit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cancelChannel = `${submitChannel}-cancel`;

  return await new Promise<string | null>((resolve) => {
    let settled = false;

    const finish = (result: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      ipcMain.removeAllListeners(submitChannel);
      ipcMain.removeAllListeners(cancelChannel);
      if (!promptWindow.isDestroyed()) {
        promptWindow.close();
      }
      resolve(result);
    };

    ipcMain.once(submitChannel, (_event, value: string) => {
      finish(value);
    });
    ipcMain.once(cancelChannel, () => {
      finish(null);
    });

    promptWindow.on("closed", () => {
      finish(null);
    });

    const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(options.title)}</title>
    <style>
      body {
        margin: 0;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8f6ee;
        color: #2a241d;
      }
      .wrap {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .message {
        font-size: 13px;
        line-height: 1.5;
        color: #62584d;
      }
      input {
        height: 40px;
        padding: 0 12px;
        border: 1px solid #d6cebf;
        border-radius: 12px;
        background: #fffdf8;
        font-size: 16px;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      button {
        min-width: 88px;
        height: 36px;
        border: 0;
        border-radius: 10px;
        cursor: pointer;
        font-size: 14px;
      }
      .cancel {
        background: #e8e1d3;
        color: #4d4439;
      }
      .ok {
        background: #6c7cff;
        color: white;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="message">${escapeHtml(options.message)}</div>
      <input id="value" value=${JSON.stringify(options.defaultValue)} />
      <div class="actions">
        <button class="cancel" id="cancel">取消</button>
        <button class="ok" id="ok">确定</button>
      </div>
    </div>
    <script>
      const { ipcRenderer } = require("electron");
      const input = document.getElementById("value");
      const submit = () => ipcRenderer.send(${JSON.stringify(submitChannel)}, input.value);
      const cancel = () => ipcRenderer.send(${JSON.stringify(cancelChannel)});
      document.getElementById("ok").addEventListener("click", submit);
      document.getElementById("cancel").addEventListener("click", cancel);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") submit();
        if (event.key === "Escape") cancel();
      });
      window.addEventListener("DOMContentLoaded", () => {
        input.focus();
        input.select();
      });
    </script>
  </body>
</html>`;

    void promptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    promptWindow.once("ready-to-show", () => {
      promptWindow.show();
      promptWindow.focus();
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getObjRect(bounds: Electron.Rectangle): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: bounds.x + bounds.width * OBJ_OFF_X,
    y: bounds.y + bounds.height * OBJ_OFF_Y,
    w: bounds.width * OBJ_SCALE_W,
    h: bounds.height * OBJ_SCALE_H
  };
}

function getHitRectScreen(bounds: Electron.Rectangle): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const obj = getObjRect(bounds);
  const scale = Math.min(obj.w, obj.h) / 45;
  const offsetX = obj.x + (obj.w - 45 * scale) / 2;
  const offsetY = obj.y + (obj.h - 45 * scale) / 2;

  return {
    left: offsetX + (currentHitBox.x + 15) * scale,
    top: offsetY + (currentHitBox.y + 25) * scale,
    right: offsetX + (currentHitBox.x + 15 + currentHitBox.w) * scale,
    bottom: offsetY + (currentHitBox.y + 25 + currentHitBox.h) * scale
  };
}

function getHitBoxForSvg(svg: string): HitBox {
  if (
    svg === "clawd-sleeping.svg" ||
    svg === "clawd-collapse-sleep.svg" ||
    svg === "clawd-idle-doze.svg"
  ) {
    return HIT_BOXES.sleeping;
  }

  if (WIDE_SVGS.has(svg)) {
    return HIT_BOXES.wide;
  }

  return HIT_BOXES.default;
}

function formatDeskState(state: DeskPetState): string {
  const labels: Record<DeskPetState, string> = {
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

  return labels[state] ?? state;
}
