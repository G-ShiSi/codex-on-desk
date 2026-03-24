import type { DeskPetState } from "../../shared/types.js";

const PRIORITY: Record<DeskPetState, number> = {
  approval: 100,
  error: 90,
  subagent_many: 80,
  subagent_one: 70,
  editing: 60,
  working: 50,
  typing: 40,
  thinking: 30,
  success: 20,
  idle: 10,
  sleeping: 0
};

const MIN_DISPLAY_MS: Record<DeskPetState, number> = {
  approval: 0,
  error: 4_000,
  subagent_many: 800,
  subagent_one: 800,
  editing: 800,
  working: 800,
  typing: 800,
  thinking: 800,
  success: 2_000,
  idle: 0,
  sleeping: 0
};

export function getStatePriority(state: DeskPetState): number {
  return PRIORITY[state];
}

export function getMinDisplayMs(state: DeskPetState): number {
  return MIN_DISPLAY_MS[state];
}
