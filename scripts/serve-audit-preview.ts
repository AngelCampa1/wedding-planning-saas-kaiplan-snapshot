/**
 * Spawns all four local-e2e services and keeps them alive so a human can browse
 * the audit-in-progress at the URLs printed at startup.
 *
 * Reuses the same command + env the Playwright webServer config uses, so the
 * stack is identical to what the audit captures.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import {
  buildLocalPlaywrightWebServers,
  ensureLocalE2ERuntime,
} from "./local-e2e-config";

async function main() {
  const runtime = await ensureLocalE2ERuntime();
  const servers = buildLocalPlaywrightWebServers(runtime);

  const e2eCwd = path.resolve(process.cwd(), "e2e");

  const children: ChildProcess[] = [];

  for (const server of servers) {
    const child = spawn(server.command, {
      cwd: e2eCwd,
      shell: true,
      stdio: "inherit",
      env: {
        ...process.env,
        ...(server.env ?? {}),
      },
    });
    children.push(child);
    child.on("exit", (code) => {
      console.error(`[serve-audit-preview] ${server.url} exited ${code}`);
    });
  }

  console.log("\n========================================");
  console.log("  Kaiplan audit preview is starting up");
  console.log("========================================");
  console.log(`  SPA dashboard:   ${runtime.urls.app}`);
  console.log(`  Public website:  ${runtime.urls.web}`);
  console.log(`  API:             ${runtime.urls.api}`);
  console.log(`  Marketing API:   ${runtime.urls.marketingApi}`);
  console.log("========================================");
  console.log("Sign up at /signup, then visit /dashboard.\n");
  console.log("Press Ctrl+C to stop everything.\n");

  const shutdown = () => {
    for (const child of children) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
    setTimeout(() => process.exit(0), 500);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
