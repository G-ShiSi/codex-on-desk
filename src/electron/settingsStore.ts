import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AppServerConnectionMode,
  BubbleDetailMode
} from "../shared/types.js";

export type SizeKey = "S" | "M" | "L";

export interface PersistedSettings {
  size: SizeKey;
  bubbleVisible: boolean;
  bubbleDetailMode: BubbleDetailMode;
  bubbleSpacingPx: number;
  connectionMode: AppServerConnectionMode;
  accentColor?: string;
}

const DEFAULT_BUBBLE_SPACING_PX = 0;
const MIN_BUBBLE_SPACING_PX = -20;
const MAX_BUBBLE_SPACING_PX = 180;

const DEFAULT_SETTINGS: PersistedSettings = {
  size: "M",
  bubbleVisible: true,
  bubbleDetailMode: "basic",
  bubbleSpacingPx: DEFAULT_BUBBLE_SPACING_PX,
  connectionMode: "auto",
  accentColor: undefined
};

export class SettingsStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async load(): Promise<PersistedSettings> {
    try {
      const contents = await readFile(this.path, "utf8");
      return sanitizeSettings(JSON.parse(contents) as Partial<PersistedSettings>);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(settings: PersistedSettings): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(settings, null, 2), "utf8");
  }
}

function sanitizeSettings(settings: Partial<PersistedSettings>): PersistedSettings {
  return {
    size: isSizeKey(settings.size) ? settings.size : DEFAULT_SETTINGS.size,
    bubbleVisible:
      typeof settings.bubbleVisible === "boolean"
        ? settings.bubbleVisible
        : DEFAULT_SETTINGS.bubbleVisible,
    bubbleDetailMode:
      settings.bubbleDetailMode === "detailed" || settings.bubbleDetailMode === "basic"
        ? settings.bubbleDetailMode
        : DEFAULT_SETTINGS.bubbleDetailMode,
    bubbleSpacingPx: normalizeBubbleSpacing(settings.bubbleSpacingPx),
    connectionMode:
      settings.connectionMode === "managed" ||
      settings.connectionMode === "external" ||
      settings.connectionMode === "auto"
        ? settings.connectionMode
        : DEFAULT_SETTINGS.connectionMode,
    accentColor: normalizeAccentColor(settings.accentColor)
  };
}

function isSizeKey(value: unknown): value is SizeKey {
  return value === "S" || value === "M" || value === "L";
}

function normalizeAccentColor(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (/^#([\da-f]{3}|[\da-f]{6})$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function normalizeBubbleSpacing(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.bubbleSpacingPx;
  }

  return Math.max(
    MIN_BUBBLE_SPACING_PX,
    Math.min(MAX_BUBBLE_SPACING_PX, Math.round(value))
  );
}
