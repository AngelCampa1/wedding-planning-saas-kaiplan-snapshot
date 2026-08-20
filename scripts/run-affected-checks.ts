import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { main, discoverPackages } from "./lib/affected-packages";

main({
  getStagedFiles: () => {
    const output = execSync("git diff --cached --name-only --diff-filter=d", {
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  },
  discoverPackages: (rootDir) =>
    discoverPackages(rootDir, {
      readdirSync: readdirSync as (path: string) => string[],
      readFileSync: readFileSync as (path: string, encoding: string) => string,
    }),
  exec: (command) => {
    console.log(`\n> ${command}\n`);
    execSync(command, { stdio: "inherit", timeout: 1_200_000 });
  },
  log: (message) => console.log(message),
  exit: (code) => process.exit(code),
  cwd: () => process.cwd(),
});
