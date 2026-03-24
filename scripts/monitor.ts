import { parseArgs } from "node:util";
import { resolve } from "node:path";
import process from "node:process";
import { AppServerMonitor } from "../src/main/codex/appServerMonitor.js";
import type { MonitorEvent } from "../src/shared/types.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cwd: { type: "string" },
      prompt: { type: "string" },
      port: { type: "string" },
      listenUrl: { type: "string" },
      record: { type: "string" },
      model: { type: "string" },
      timeout: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false }
    },
    allowPositionals: false
  });

  if (values.help) {
    printHelp();
    return;
  }

  const cwd = resolve(values.cwd ?? process.cwd());
  const recordPath = values.record ? resolve(values.record) : undefined;
  const timeoutMs = values.timeout ? Number(values.timeout) : 60_000;
  const port = values.port ? Number(values.port) : undefined;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout 必须是正整数，单位毫秒。");
  }

  if (typeof port !== "undefined" && (!Number.isInteger(port) || port <= 0)) {
    throw new Error("--port 必须是正整数。");
  }

  const monitor = new AppServerMonitor({
    cwd,
    port,
    listenUrl: values.listenUrl,
    recordPath,
    model: values.model,
    timeoutMs
  });

  const stop = async () => {
    await monitor.stop();
  };

  process.once("SIGINT", async () => {
    await stop();
    process.exit(130);
  });

  process.once("SIGTERM", async () => {
    await stop();
    process.exit(143);
  });

  monitor.onEvent((event) => {
    if (values.json) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
      return;
    }

    process.stdout.write(`${formatEvent(event)}\n`);
  });

  const initializeResult = await monitor.start();

  if (!values.json) {
    process.stdout.write(
      `已连接 codex app-server: ${initializeResult.platformOs}/${initializeResult.platformFamily}\n`
    );
  }

  if (values.prompt) {
    const { threadId, turnId } = await monitor.runPrompt(values.prompt);
    if (!values.json) {
      process.stdout.write(`已启动测试任务 ${turnId}，线程 ${threadId}\n`);
    }
    await monitor.waitForTurnCompletion(turnId, timeoutMs);
    await stop();
    return;
  }

  if (!values.json) {
    process.stdout.write("正在监听事件，按 Ctrl+C 停止。\n");
  }

  await new Promise<void>(() => undefined);
}

function formatEvent(event: MonitorEvent): string {
  const pieces = [`[${event.timestamp}]`, event.kind];

  if (event.stateHint) {
    pieces.push(`state=${event.stateHint}`);
  }
  if (event.threadId) {
    pieces.push(`thread=${event.threadId}`);
  }
  if (event.turnId) {
    pieces.push(`turn=${event.turnId}`);
  }
  if (event.itemId) {
    pieces.push(`item=${event.itemId}`);
  }
  if (event.itemType) {
    pieces.push(`itemType=${event.itemType}`);
  }
  if (event.status) {
    pieces.push(`status=${event.status}`);
  }
  if (event.requestMethod) {
    pieces.push(`request=${event.requestMethod}`);
  }
  if (event.activeFlags && event.activeFlags.length > 0) {
    pieces.push(`flags=${event.activeFlags.join(",")}`);
  }
  if (event.delta) {
    pieces.push(`delta=${JSON.stringify(truncate(event.delta))}`);
  }
  if (event.preview) {
    pieces.push(`preview=${JSON.stringify(truncate(event.preview))}`);
  }
  if (event.error) {
    pieces.push(`error=${JSON.stringify(event.error)}`);
  }

  return pieces.join(" ");
}

function truncate(value: string, maxLength = 80): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength - 3)}...`;
}

function printHelp(): void {
  process.stdout.write(`用法: npm run monitor -- [options]

选项:
  --cwd <path>       thread/start 使用的工作目录
  --prompt <text>    连接成功后自动跑一条测试 Prompt
  --record <path>    将归一化事件追加写入 JSONL
  --port <number>    codex app-server 本地端口
  --listenUrl <url>  连接已有的外部 codex app-server WebSocket 地址
  --model <name>     可选的模型覆盖
  --timeout <ms>     请求超时时间，单位毫秒
  --json             以 JSONL 格式输出归一化事件
  -h, --help         显示帮助
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
