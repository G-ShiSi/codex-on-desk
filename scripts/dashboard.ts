import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { DashboardServer } from "../src/main/dashboard/dashboardServer.js";
import { CodexRuntime } from "../src/electron/runtime.js";
import type { AppServerConnectionConfig } from "../src/shared/types.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cwd: { type: "string" },
      listenUrl: { type: "string" },
      dashboardPort: { type: "string" },
      prompt: { type: "string" },
      help: { type: "boolean", short: "h", default: false }
    },
    allowPositionals: false
  });

  if (values.help) {
    printHelp();
    return;
  }

  const cwd = resolve(values.cwd ?? process.cwd());
  const staticRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const dashboardPort = values.dashboardPort ? Number(values.dashboardPort) : 4580;
  const runtime = new CodexRuntime(cwd, getInitialDashboardConfig(cwd, values.listenUrl));

  const dashboard = new DashboardServer({
    staticRoot,
    runtime,
    port: dashboardPort
  });

  const shutdown = async (exitCode = 0) => {
    await dashboard.stop();
    await runtime.stop();
    process.exit(exitCode);
  };

  process.once("SIGINT", async () => {
    await shutdown(130);
  });

  process.once("SIGTERM", async () => {
    await shutdown(143);
  });

  await runtime.start();
  const server = await dashboard.start();
  const snapshot = runtime.getSnapshot();

  process.stdout.write(
    `状态面板已启动: http://127.0.0.1:${server.port} (${snapshot.connection.mode} / ${snapshot.monitor.serverPlatform ?? "unknown"})\n`
  );

  if (values.prompt) {
    const result = await runtime.runPrompt(values.prompt);
    process.stdout.write(
      `已启动测试任务 ${result.turnId}，线程 ${result.threadId}\n`
    );
  }

  await new Promise<void>(() => undefined);
}

function printHelp(): void {
  process.stdout.write(`用法: npm run dashboard -- [options]

选项:
  --cwd <path>             工作目录
  --listenUrl <url>        连接已有的外部 codex app-server WebSocket 地址
  --dashboardPort <number> 状态面板 HTTP 端口
  --prompt <text>          启动后自动跑一条测试 Prompt，仅 managed 模式可用
  -h, --help               显示帮助
`);
}

function getInitialDashboardConfig(
  cwd: string,
  listenUrl?: string
): AppServerConnectionConfig {
  const resolvedListenUrl = listenUrl?.trim();
  const externalUrls = [
    ...(process.env.CODEX_APP_SERVER_URLS ?? "").split(/[\n,]/),
    process.env.CODEX_APP_SERVER_URL ?? "",
    resolvedListenUrl ?? ""
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  if (externalUrls.length > 0) {
    return { mode: "external", listenUrl: externalUrls[0] };
  }

  if (process.env.CODEX_DISABLE_AUTO_DISCOVERY === "1") {
    return { mode: "managed", cwd };
  }

  return { mode: "auto" };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
