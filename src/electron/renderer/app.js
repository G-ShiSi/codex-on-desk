const container = document.getElementById("pet-container");
const scene = document.getElementById("scene");
const statusBubble = document.getElementById("status-bubble");
const statusTitle = document.getElementById("status-title");
const statusDetail = document.getElementById("status-detail");
const statusBadge = document.getElementById("status-badge");

let isDragging = false;
let lastScreenX = 0;
let lastScreenY = 0;
let pendingDx = 0;
let pendingDy = 0;
let dragRAF = null;
let dragMoved = false;

let clawdEl = document.getElementById("clawd");
let pendingNext = null;
let currentState = "disconnected";
let currentSvg = "clawd-disconnected.svg";
let currentMeta = null;
let queuedState = null;
let queuedSvg = null;
let queuedMeta = null;
let reactionTimer = null;
let bubbleTimer = null;
let bubbleConfig = {
  visible: true,
  detailMode: "basic",
  spacingPx: 0
};
let appearanceConfig = {
  accentColor: undefined
};
let currentSize = "M";

let eyeTarget = null;
let bodyTarget = null;
let shadowTarget = null;
let eyeBaseTransform = "";

const STATE_META = {
  disconnected: {
    badge: "Codex",
    title: "连接中",
    detail: "正在尝试连接本地运行时",
    persist: true
  },
  idle: {
    badge: "Idle",
    title: "待命中",
    detail: "桌宠保持观察，有新任务时会立刻动起来",
    autoHideMs: 1800
  },
  yawning: {
    badge: "Rest",
    title: "有点困了",
    detail: "长时间没有活动，准备进入休息状态",
    autoHideMs: 2000
  },
  dozing: {
    badge: "Rest",
    title: "打盹中",
    detail: "轻度休眠，鼠标一动就会醒",
    autoHideMs: 2200
  },
  sleeping: {
    badge: "Sleep",
    title: "睡着了",
    detail: "当前没有任务，桌宠已进入深度休息",
    autoHideMs: 2400
  },
  waking: {
    badge: "Wake",
    title: "醒了",
    detail: "检测到活动，正在回到待命状态",
    autoHideMs: 1400
  },
  "mini-idle": {
    badge: "Mini",
    title: "贴边待命",
    detail: "停靠在屏幕右侧，经过时会探头",
    autoHideMs: 1400
  },
  "mini-peek": {
    badge: "Mini",
    title: "探头中",
    detail: "靠近它时会主动看过来",
    autoHideMs: 1400
  },
  "mini-alert": {
    badge: "Alert",
    title: "有提醒",
    detail: "出现异常或需要你留意的状态",
    persist: true
  },
  "mini-happy": {
    badge: "Done",
    title: "完成了",
    detail: "任务顺利结束，给你一个小反馈",
    autoHideMs: 1800
  },
  "mini-sleep": {
    badge: "Sleep",
    title: "贴边休眠",
    detail: "长时间空闲后会在边缘安静睡觉",
    autoHideMs: 2200
  },
  thinking: {
    badge: "Think",
    title: "思考中",
    detail: "正在整理上下文和计划下一步动作",
    persist: true
  },
  working: {
    badge: "Work",
    title: "执行中",
    detail: "正在运行命令或处理当前任务",
    persist: true
  },
  juggling: {
    badge: "Multi",
    title: "多线程忙碌",
    detail: "正在并行处理多个代理或多个任务片段",
    persist: true
  },
  notification: {
    badge: "Alert",
    title: "需要注意",
    detail: "当前状态需要你看一眼",
    persist: true
  },
  error: {
    badge: "Error",
    title: "出了点问题",
    detail: "本轮任务遇到错误，建议查看最近事件",
    persist: true
  },
  attention: {
    badge: "Done",
    title: "任务完成",
    detail: "这一轮已经结束，桌宠进入庆祝状态",
    autoHideMs: 2200
  },
  carrying: {
    badge: "Edit",
    title: "正在改文件",
    detail: "当前重点在文件变更和内容调整",
    persist: true
  }
};

container.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  container.setPointerCapture(event.pointerId);
  isDragging = true;
  lastScreenX = event.screenX;
  lastScreenY = event.screenY;
  pendingDx = 0;
  pendingDy = 0;
  dragMoved = false;
  window.electronAPI.dragLock(true);
  container.classList.add("dragging");
  scene.dataset.state = "dragging";
});

document.addEventListener("pointermove", (event) => {
  if (!isDragging) {
    return;
  }

  pendingDx += event.screenX - lastScreenX;
  pendingDy += event.screenY - lastScreenY;
  lastScreenX = event.screenX;
  lastScreenY = event.screenY;
  if (Math.abs(pendingDx) > 3 || Math.abs(pendingDy) > 3) {
    dragMoved = true;
  }

  if (!dragRAF) {
    dragRAF = requestAnimationFrame(() => {
      window.electronAPI.moveWindowBy(pendingDx, pendingDy);
      pendingDx = 0;
      pendingDy = 0;
      dragRAF = null;
    });
  }
});

document.addEventListener("pointerup", (event) => {
  if (event.button !== 0) {
    return;
  }
  stopDrag();
});

container.addEventListener("pointercancel", stopDrag);
container.addEventListener("lostpointercapture", stopDrag);
window.addEventListener("blur", stopDrag);

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.electronAPI.showContextMenu();
});

window.electronAPI.onStateChange((_state, svg, meta) => {
  currentState = _state;
  currentSvg = svg;
  currentMeta = meta ?? null;

  if (reactionTimer) {
    queuedState = _state;
    queuedSvg = svg;
    queuedMeta = meta ?? null;
    return;
  }

  applyState(_state, svg, meta);
});

window.electronAPI.onEyeMove((dx, dy) => {
  if (eyeTarget) {
    const eyeDx = Math.round(dx * 0.2 * 10) / 10;
    const eyeDy = Math.round(dy * 0.16 * 10) / 10;
    eyeTarget.setAttribute("transform", composeTranslate(eyeBaseTransform, eyeDx, eyeDy));
  }
  if (bodyTarget || shadowTarget) {
    const bdx = Math.round(dx * 0.06 * 10) / 10;
    const bdy = Math.round(dy * 0.06 * 10) / 10;
    if (bodyTarget) {
      bodyTarget.style.transform = `translate(${bdx}px, ${bdy}px)`;
    }
    if (shadowTarget) {
      const scaleX = 1 + Math.min(Math.abs(bdx) * 0.05, 0.12);
      shadowTarget.style.transform = `scaleX(${scaleX})`;
    }
  }
});

window.electronAPI.onWakeFromDoze(() => {
  if (!clawdEl || !clawdEl.contentDocument) {
    return;
  }
  try {
    const eyes = clawdEl.contentDocument.getElementById("eyes-doze");
    if (eyes) {
      eyes.style.transform = "scaleY(1)";
    }
  } catch {}
});

window.electronAPI.onBubbleConfigChange((config) => {
  bubbleConfig = config;
  applyBubbleLayout();
  if (!bubbleConfig.visible) {
    hideBubble();
    return;
  }
  renderBubble(currentState, currentMeta ?? undefined);
});

window.electronAPI.onSizeChange((size) => {
  currentSize = size;
  applySizeLayout();
});

window.electronAPI.onAppearanceConfigChange((config) => {
  appearanceConfig = config;
  applyAppearanceConfig();
});

window.electronAPI.onRequestAccentColorInput((currentColor) => {
  const input = window.prompt(
    "输入颜色值，例如 #7284ff 或 #4f46e5。留空可恢复默认。",
    currentColor ?? appearanceConfig.accentColor ?? ""
  );

  if (input === null) {
    return;
  }

  const trimmed = input.trim();
  if (trimmed.length > 0 && !/^#([\da-fA-F]{3}|[\da-fA-F]{6})$/.test(trimmed)) {
    window.alert("颜色格式无效，请输入 #rgb 或 #rrggbb。");
    return;
  }

  void window.electronAPI.setAccentColor(trimmed || undefined);
});

window.electronAPI.getSnapshot().then((snapshot) => {
  if (snapshot.runtimeStatus !== "ready") {
    applyState("disconnected", "clawd-disconnected.svg");
  }
});

window.electronAPI.getBubbleConfig().then((config) => {
  bubbleConfig = config;
  applyBubbleLayout();
  if (!config.visible) {
    hideBubble();
  }
});

window.electronAPI.getAppearanceConfig().then((config) => {
  appearanceConfig = config;
  applyAppearanceConfig();
});

applySizeLayout();

container.addEventListener("dblclick", (event) => {
  if (isDragging || dragMoved) {
    return;
  }

  const rect = container.getBoundingClientRect();
  const sideSvg =
    event.clientX < rect.left + rect.width / 2 ? "clawd-react-left.svg" : "clawd-react-right.svg";
  playReaction(sideSvg, 1100);
});

function stopDrag() {
  if (!isDragging) {
    return;
  }

  isDragging = false;
  window.electronAPI.dragLock(false);
  container.classList.remove("dragging");
  scene.dataset.state = currentState;

  if (pendingDx !== 0 || pendingDy !== 0) {
    if (dragRAF) {
      cancelAnimationFrame(dragRAF);
      dragRAF = null;
    }
    window.electronAPI.moveWindowBy(pendingDx, pendingDy);
    pendingDx = 0;
    pendingDy = 0;
  }

  window.electronAPI.dragEnd();
}

function swapState(svgFile) {
  if (pendingNext) {
    pendingNext.remove();
    pendingNext = null;
  }

  const next = document.createElement("object");
  next.data = `../assets/svg/${svgFile}`;
  next.type = "image/svg+xml";
  next.id = "clawd";
  next.classList.add("state-enter");
  next.style.opacity = "0";
  container.appendChild(next);
  pendingNext = next;

  const swap = () => {
    if (pendingNext !== next) {
      return;
    }

    next.style.transition = "none";
    next.style.opacity = "1";
    next.classList.remove("state-enter");
    for (const child of [...container.querySelectorAll("object")]) {
      if (child !== next) {
        child.remove();
      }
    }
    pendingNext = null;
    clawdEl = next;
    attachEyeTracking(next);
  };

  next.addEventListener("load", swap, { once: true });
  setTimeout(() => {
    if (pendingNext !== next) {
      return;
    }
    try {
      if (!next.contentDocument) {
        next.remove();
        pendingNext = null;
        return;
      }
    } catch {
      next.remove();
      pendingNext = null;
      return;
    }
    swap();
  }, 3000);
}

function attachEyeTracking(objectEl) {
  eyeTarget = null;
  bodyTarget = null;
  shadowTarget = null;
  eyeBaseTransform = "";
  try {
    const svgDoc = objectEl.contentDocument;
    if (svgDoc) {
      eyeTarget = svgDoc.getElementById("eyes-track-js") ?? svgDoc.getElementById("eyes-js");
      bodyTarget = svgDoc.getElementById("body-track-js") ?? svgDoc.getElementById("body-js");
      shadowTarget = svgDoc.getElementById("shadow-js");
      if (eyeTarget) {
        eyeBaseTransform = eyeTarget.getAttribute("transform") ?? "";
      }
    }
  } catch {}
}

function detachEyeTracking() {
  if (eyeTarget) {
    if (eyeBaseTransform) {
      eyeTarget.setAttribute("transform", eyeBaseTransform);
    } else {
      eyeTarget.removeAttribute("transform");
    }
  }
  if (bodyTarget) {
    bodyTarget.style.transform = "";
  }
  if (shadowTarget) {
    shadowTarget.style.transform = "";
  }
  eyeTarget = null;
  bodyTarget = null;
  shadowTarget = null;
  eyeBaseTransform = "";
}

function composeTranslate(baseTransform, dx, dy) {
  const translate = `translate(${dx} ${dy})`;
  return baseTransform ? `${baseTransform} ${translate}` : translate;
}

function applyState(state, svg, meta) {
  scene.dataset.state = state;
  swapState(svg);
  renderBubble(state, meta);
  if (svg === "clawd-idle-follow.svg") {
    attachEyeTracking(clawdEl);
  } else {
    detachEyeTracking();
  }
}

function renderBubble(state, meta) {
  if (!bubbleConfig.visible) {
    hideBubble();
    return;
  }

  const stateMeta = STATE_META[state] ?? {
    badge: "Codex",
    title: state,
    detail: "状态已更新",
    autoHideMs: 1800
  };

  statusBadge.textContent = stateMeta.badge;
  statusTitle.textContent = stateMeta.title;
  statusDetail.textContent = meta?.detailOverride ?? stateMeta.detail;
  statusDetail.style.display = bubbleConfig.detailMode === "detailed" ? "" : "none";
  statusBubble.classList.remove("is-hidden");

  if (bubbleTimer) {
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }

  if (stateMeta.persist) {
    return;
  }

  const hideMs = stateMeta.autoHideMs ?? 1800;
  bubbleTimer = setTimeout(() => {
    hideBubble();
  }, hideMs);
}

function playReaction(svgFile, durationMs) {
  if (reactionTimer) {
    clearTimeout(reactionTimer);
    reactionTimer = null;
  }

  window.electronAPI.pauseCursorPolling();
  swapState(svgFile);
  if (bubbleConfig.visible) {
    statusBadge.textContent = "React";
    statusTitle.textContent = "戳了一下";
    statusDetail.textContent =
      bubbleConfig.detailMode === "detailed"
        ? "桌宠给了一个短暂的互动反馈 | 来源: 本地交互"
        : "桌宠给了一个短暂的互动反馈";
    statusDetail.style.display = bubbleConfig.detailMode === "detailed" ? "" : "none";
    statusBubble.classList.remove("is-hidden");
  } else {
    hideBubble();
  }

  reactionTimer = setTimeout(() => {
    reactionTimer = null;
    window.electronAPI.resumeFromReaction();
    applyState(queuedState ?? currentState, queuedSvg ?? currentSvg, queuedMeta ?? undefined);
    queuedState = null;
    queuedSvg = null;
    queuedMeta = null;
  }, durationMs);
}

function hideBubble() {
  statusBubble.classList.add("is-hidden");
  if (bubbleTimer) {
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }
}

function applyBubbleLayout() {
  const baseSafeSpace = bubbleConfig.detailMode === "detailed" ? 56 : 0;
  const safeSpace = !bubbleConfig.visible ? 0 : Math.max(0, baseSafeSpace + (bubbleConfig.spacingPx ?? 0));
  scene.style.setProperty("--bubble-safe-space", `${safeSpace}px`);
}

function applySizeLayout() {
  scene.dataset.size = currentSize;
}

function applyAppearanceConfig() {
  const accent = normalizeHexColor(appearanceConfig.accentColor);

  if (!accent) {
    scene.style.removeProperty("--accent");
    scene.style.removeProperty("--accent-soft");
    scene.style.removeProperty("--accent-strong");
    scene.style.removeProperty("--pet-tint-filter");
    return;
  }

  const { r, g, b } = hexToRgb(accent);
  scene.style.setProperty("--accent", accent);
  scene.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.18)`);
  scene.style.setProperty("--accent-strong", `rgba(${r}, ${g}, ${b}, 0.42)`);
  scene.style.setProperty("--pet-tint-filter", buildPetTintFilter(accent));
}

function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^#([\da-fA-F]{3}|[\da-fA-F]{6})$/.test(trimmed)) {
    return undefined;
  }

  if (trimmed.length === 7) {
    return trimmed.toLowerCase();
  }

  return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
}

function hexToRgb(hex) {
  const value = hex.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function buildPetTintFilter(hex) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHsl(r, g, b);
  const baseHue = 232;
  const hueRotate = Math.round(h - baseHue);
  const saturation = (0.9 + s * 1.6).toFixed(2);
  return `hue-rotate(${hueRotate}deg) saturate(${saturation})`;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;

  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }

  return { h: h * 60, s, l };
}
