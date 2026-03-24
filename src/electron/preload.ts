import { contextBridge, ipcRenderer } from "electron";
import type {
  AppearanceConfig,
  BubbleConfig,
  BubbleRenderMeta,
  DesktopPetSnapshot
} from "../shared/types.js";

contextBridge.exposeInMainWorld("electronAPI", {
  showContextMenu(): void {
    ipcRenderer.send("show-context-menu");
  },
  moveWindowBy(dx: number, dy: number): void {
    ipcRenderer.send("move-window-by", dx, dy);
  },
  dragLock(locked: boolean): void {
    ipcRenderer.send("drag-lock", locked);
  },
  dragEnd(): void {
    ipcRenderer.send("drag-end");
  },
  pauseCursorPolling(): void {
    ipcRenderer.send("pause-cursor-polling");
  },
  resumeFromReaction(): void {
    ipcRenderer.send("resume-from-reaction");
  },
  onStateChange(callback: (state: string, svg: string, meta?: BubbleRenderMeta) => void): () => void {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      state: string,
      svg: string,
      meta?: BubbleRenderMeta
    ) => {
      callback(state, svg, meta);
    };
    ipcRenderer.on("state-change", wrapped);
    return () => ipcRenderer.removeListener("state-change", wrapped);
  },
  onEyeMove(callback: (dx: number, dy: number) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, dx: number, dy: number) => {
      callback(dx, dy);
    };
    ipcRenderer.on("eye-move", wrapped);
    return () => ipcRenderer.removeListener("eye-move", wrapped);
  },
  onWakeFromDoze(callback: () => void): () => void {
    const wrapped = () => callback();
    ipcRenderer.on("wake-from-doze", wrapped);
    return () => ipcRenderer.removeListener("wake-from-doze", wrapped);
  },
  onBubbleConfigChange(callback: (config: BubbleConfig) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, config: BubbleConfig) => {
      callback(config);
    };
    ipcRenderer.on("bubble-config-change", wrapped);
    return () => ipcRenderer.removeListener("bubble-config-change", wrapped);
  },
  onSizeChange(callback: (size: "S" | "M" | "L") => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, size: "S" | "M" | "L") => {
      callback(size);
    };
    ipcRenderer.on("size-change", wrapped);
    return () => ipcRenderer.removeListener("size-change", wrapped);
  },
  onAppearanceConfigChange(callback: (config: AppearanceConfig) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, config: AppearanceConfig) => {
      callback(config);
    };
    ipcRenderer.on("appearance-config-change", wrapped);
    return () => ipcRenderer.removeListener("appearance-config-change", wrapped);
  },
  onRequestAccentColorInput(callback: (currentColor?: string) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, currentColor?: string) => {
      callback(currentColor);
    };
    ipcRenderer.on("request-accent-color-input", wrapped);
    return () => ipcRenderer.removeListener("request-accent-color-input", wrapped);
  },
  getSnapshot(): Promise<DesktopPetSnapshot> {
    return ipcRenderer.invoke("codex:getSnapshot");
  },
  getBubbleConfig(): Promise<BubbleConfig> {
    return ipcRenderer.invoke("codex:getBubbleConfig");
  },
  getAppearanceConfig(): Promise<AppearanceConfig> {
    return ipcRenderer.invoke("codex:getAppearanceConfig");
  },
  setAccentColor(accentColor?: string): Promise<void> {
    return ipcRenderer.invoke("codex:setAccentColor", accentColor);
  },
  setBubbleSpacing(spacingPx: number): Promise<void> {
    return ipcRenderer.invoke("codex:setBubbleSpacing", spacingPx);
  },
  runPrompt(prompt: string): Promise<{ threadId: string; turnId: string }> {
    return ipcRenderer.invoke("codex:runPrompt", prompt);
  }
});
