import { execFileSync } from "node:child_process";
import {
  assertCloudflareApiToken,
  assertCleanupProjectsMatchStaleInventory,
  assertOnlyCanonicalMarketingProject,
  buildCleanupCommands,
  type CloudflarePagesProject,
  formatCleanupCommand,
  parseCleanupArgs,
} from "./lib/cloudflare-marketing-cleanup";
import { buildPnpmInvocation } from "./lib/pnpm-invocation";

const args = parseCleanupArgs(process.argv.slice(2));
assertCloudflareApiToken(process.env);

function listProjects(): CloudflarePagesProject[] {
  const command = buildPnpmInvocation([
    "exec",
    "wrangler",
    "pages",
    "project",
    "list",
    "--json",
  ]);
  const output = execFileSync(command.executable, command.args, {
    encoding: "utf8",
    env: process.env,
    timeout: 300_000,
  });

  return JSON.parse(output) as CloudflarePagesProject[];
}

const initialProjects = listProjects();
assertCleanupProjectsMatchStaleInventory(args.projects, initialProjects);

for (const command of buildCleanupCommands(args.projects)) {
  if (command.args.includes("list")) {
    continue;
  }

  if (args.dryRun) {
    console.log(`[dry-run] ${formatCleanupCommand(command)}`);
    continue;
  }

  console.log(`\n> ${formatCleanupCommand(command)}\n`);
  execFileSync(command.executable, command.args, {
    stdio: "inherit",
    timeout: 300_000,
    env: process.env,
  });
}

if (args.dryRun) {
  console.log("[dry-run] verify stale Kaiplan Pages projects are gone");
} else {
  assertOnlyCanonicalMarketingProject(listProjects());
}
