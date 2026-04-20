import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { SessionFileMonitor } from "../src/main/codex/sessionFileMonitor.ts";
import { MonitorStateAggregator } from "../src/main/state/aggregator.ts";

test("reads tail events from large multibyte session files", async (t) => {
  const sessionRoot = await mkdtemp(join(tmpdir(), "codex-on-desk-"));
  t.after(async () => {
    await rm(sessionRoot, { recursive: true, force: true });
  });

  const sessionFile = join(
    sessionRoot,
    "2026",
    "04",
    "20",
    "rollout-large-multibyte.jsonl"
  );
  await mkdir(dirname(sessionFile), { recursive: true });

  const now = Date.now();
  const records = [
    "你".repeat(140_000),
    toJsonlRecord({
      timestamp: new Date(now - 100).toISOString(),
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-1"
      }
    }),
    toJsonlRecord({
      timestamp: new Date(now).toISOString(),
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn-1"
      }
    })
  ];

  await writeFile(sessionFile, `${records.join("\n")}\n`, "utf8");
  const currentTime = new Date();
  await utimes(sessionFile, currentTime, currentTime);

  const aggregator = new MonitorStateAggregator();
  const monitor = new SessionFileMonitor({
    sessionRoot,
    sourceId: "auto:sessions",
    sourceLabel: "codex auto",
    scanIntervalMs: 50
  });
  const threadEvents: string[] = [];

  monitor.onEvent((event) => {
    aggregator.applyEvent(event);
    if (event.threadId === "rollout-large-multibyte.jsonl") {
      threadEvents.push(event.kind);
    }
  });

  await monitor.start();
  t.after(async () => {
    await monitor.stop();
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  const snapshot = aggregator.getSnapshot();

  assert.deepEqual(threadEvents, [
    "thread.status.changed",
    "turn.started",
    "thread.status.changed",
    "turn.completed"
  ]);
  assert.equal(snapshot.threads.length, 1);
  assert.equal(snapshot.threads[0]?.threadId, "rollout-large-multibyte.jsonl");
  assert.equal(snapshot.threads[0]?.lastEventKind, "turn.completed");
});

function toJsonlRecord(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}
