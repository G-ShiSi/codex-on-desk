import type {
  AppearanceConfig,
  BubbleConfig,
  BubbleRenderMeta,
  DesktopPetSnapshot
} from "../../shared/types";

declare global {
  interface Window {
    electronAPI: {
      showContextMenu(): void;
      moveWindowBy(dx: number, dy: number): void;
      dragLock(locked: boolean): void;
      dragEnd(): void;
      pauseCursorPolling(): void;
      resumeFromReaction(): void;
      onStateChange(callback: (state: string, svg: string, meta?: BubbleRenderMeta) => void): () => void;
      onEyeMove(callback: (dx: number, dy: number) => void): () => void;
      onWakeFromDoze(callback: () => void): () => void;
      onBubbleConfigChange(callback: (config: BubbleConfig) => void): () => void;
      onSizeChange(callback: (size: "S" | "M" | "L") => void): () => void;
      onAppearanceConfigChange(callback: (config: AppearanceConfig) => void): () => void;
      onRequestAccentColorInput(callback: (currentColor?: string) => void): () => void;
      getSnapshot(): Promise<DesktopPetSnapshot>;
      getBubbleConfig(): Promise<BubbleConfig>;
      getAppearanceConfig(): Promise<AppearanceConfig>;
      setAccentColor(accentColor?: string): Promise<void>;
      setBubbleSpacing(spacingPx: number): Promise<void>;
      runPrompt(prompt: string): Promise<{ threadId: string; turnId: string }>;
    };
  }
}

export {};
