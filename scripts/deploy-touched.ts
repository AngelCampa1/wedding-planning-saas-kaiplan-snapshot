import { execFileSync, execSync } from "node:child_process";
import {
  filterTargets,
  formatDeployPlan,
  formatDeploySummary,
  mapChangedFilesToDeployTargets,
  parseDeployArgs,
  runDeploys,
} from "./lib/deploy-targets";

function getChangedFiles(base: string): string[] {
  const committedOutput = execFileSync(
    "git",
    ["diff", "--name-only", `${base}..HEAD`],
    { encoding: "utf8" },
  );
  const stagedOutput = execFileSync(
    "git",
    ["diff", "--cached", "--name-only"],
    { encoding: "utf8" },
  );
  const unstagedOutput = execFileSync("git", ["diff", "--name-only"], {
    encoding: "utf8",
  });
  const untrackedOutput = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );

  return Array.from(
    new Set(
      `${committedOutput}\n${stagedOutput}\n${unstagedOutput}\n${untrackedOutput}`
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  )
    .sort()
    .filter(Boolean);
}

const args = parseDeployArgs(process.argv.slice(2), process.env);

// When --only is set, skip the git diff entirely — the user is overriding
// touched-file detection. Otherwise, use the base ref to find what changed.
const touched =
  args.only !== undefined
    ? []
    : mapChangedFilesToDeployTargets(getChangedFiles(args.base));

const targets = filterTargets(touched, { only: args.only, skip: args.skip });

console.log(formatDeployPlan(targets));

if (args.dryRun) {
  for (const target of targets) {
    console.log(`[dry-run] pnpm run deploy:${target}`);
  }
  process.exit(0);
}

const results = runDeploys(targets, (command) => {
  console.log(`\n> ${command}\n`);
  execSync(command, { stdio: "inherit", timeout: 900_000 });
});

console.log(`\n${formatDeploySummary(results)}`);

if (results.some((result) => !result.ok)) {
  process.exit(1);
}
