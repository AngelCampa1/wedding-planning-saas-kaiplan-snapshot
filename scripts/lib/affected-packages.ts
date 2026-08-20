import { join } from "node:path";

const ROOT_GATE_FILES = new Set([
  ".lintstagedrc.json",
  "eslint.config.js",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/tsconfig.json",
  "scripts/vitest.config.ts",
  "tsconfig.base.json",
  "turbo.json",
]);

export interface PackageInfo {
  name: string;
  scripts: Record<string, string>;
}

export interface AffectedPackage {
  name: string;
  dir: string;
  scripts: Record<string, string>;
}

export interface FilterArgs {
  lintFilters: string[];
  typecheckFilters: string[];
  coverageFilters: string[];
  runScriptsTests: boolean;
  runScriptsTypecheck: boolean;
}

export type PackageMap = Record<string, PackageInfo>;

export interface FsDeps {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: string) => string;
}

export interface Deps {
  getStagedFiles: () => string[];
  discoverPackages: (rootDir: string) => PackageMap;
  exec: (command: string) => void;
  log: (message: string) => void;
  exit: (code: number) => void;
  cwd: () => string;
}

export function mapFileToPackage(
  filePath: string,
  packages: PackageMap,
): AffectedPackage | null {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.startsWith("scripts/")) {
    return { name: "__scripts__", dir: "scripts", scripts: {} };
  }

  // e2e/ changes are skipped in pre-commit — E2E requires live servers and
  // runs in CI or manually via `pnpm run e2e:browser`.
  if (normalized.startsWith("e2e/")) {
    return null;
  }

  for (const [dir, pkg] of Object.entries(packages)) {
    if (normalized.startsWith(dir + "/")) {
      return { name: pkg.name, dir, scripts: pkg.scripts };
    }
  }

  return null;
}

export function getAffectedPackages(
  files: string[],
  packages: PackageMap,
): AffectedPackage[] {
  const normalizedFiles = files.map((file) => file.replace(/\\/g, "/"));
  const hasRootGateChange = normalizedFiles.some((file) =>
    ROOT_GATE_FILES.has(file),
  );
  if (hasRootGateChange) {
    const affectedPackages = Object.entries(packages).map(([dir, pkg]) => ({
      name: pkg.name,
      dir,
      scripts: pkg.scripts,
    }));
    const needsScriptsChecks = normalizedFiles.some(
      (file) =>
        file === "package.json" ||
        file === "scripts/tsconfig.json" ||
        file === "scripts/vitest.config.ts" ||
        file.startsWith("scripts/"),
    );
    if (needsScriptsChecks) {
      affectedPackages.push({
        name: "__scripts__",
        dir: "scripts",
        scripts: {},
      });
    }
    return affectedPackages;
  }

  const seen = new Set<string>();
  const result: AffectedPackage[] = [];

  for (const file of files) {
    const pkg = mapFileToPackage(file, packages);
    if (pkg && !seen.has(pkg.name)) {
      seen.add(pkg.name);
      result.push(pkg);
    }
  }

  return result;
}

export function buildFilterArgs(packages: AffectedPackage[]): FilterArgs {
  const lintFilters: string[] = [];
  const typecheckFilters: string[] = [];
  const coverageFilters: string[] = [];
  let runScriptsTests = false;
  let runScriptsTypecheck = false;

  for (const pkg of packages) {
    if (pkg.name === "__scripts__") {
      runScriptsTests = true;
      runScriptsTypecheck = true;
      continue;
    }
    if (pkg.scripts.lint) {
      lintFilters.push(`--filter=${pkg.name}`);
    }
    if (pkg.scripts.typecheck) {
      typecheckFilters.push(`--filter=${pkg.name}`);
    }
    if (pkg.scripts["test:coverage"]) {
      coverageFilters.push(`--filter=${pkg.name}`);
    }
  }

  return {
    lintFilters,
    typecheckFilters,
    coverageFilters,
    runScriptsTests,
    runScriptsTypecheck,
  };
}

export function discoverPackages(rootDir: string, fs: FsDeps): PackageMap {
  const packages: PackageMap = {};
  const workspaceDirs = ["packages", "apps"];

  for (const wsDir of workspaceDirs) {
    const fullPath = join(rootDir, wsDir);
    let entries: string[];
    try {
      entries = fs.readdirSync(fullPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgJsonPath = join(fullPath, entry, "package.json");
      try {
        const raw = fs.readFileSync(pkgJsonPath, "utf-8");
        const parsed = JSON.parse(raw);
        const relDir = `${wsDir}/${entry}`;
        packages[relDir] = {
          name: parsed.name || entry,
          scripts:
            typeof parsed.scripts === "object" && parsed.scripts !== null
              ? (parsed.scripts as Record<string, string>)
              : {},
        };
      } catch {
        continue;
      }
    }
  }

  return packages;
}

export function main(deps: Deps): void {
  const rootDir = deps.cwd();
  const stagedFiles = deps.getStagedFiles();

  if (stagedFiles.length === 0) {
    deps.log("No staged files. Skipping package-level checks.");
    deps.exit(0);
    return;
  }

  const packages = deps.discoverPackages(rootDir);
  const affected = getAffectedPackages(stagedFiles, packages);

  if (affected.length === 0) {
    deps.log("No workspace packages affected. Skipping checks.");
    deps.exit(0);
    return;
  }

  const {
    lintFilters,
    typecheckFilters,
    coverageFilters,
    runScriptsTests,
    runScriptsTypecheck,
  } = buildFilterArgs(affected);

  const affectedNames = affected
    .filter((p) => p.name !== "__scripts__")
    .map((p) => p.name);
  if (affectedNames.length > 0) {
    deps.log(`Affected packages: ${affectedNames.join(", ")}`);
  }

  if (lintFilters.length > 0) {
    deps.exec(`pnpm exec turbo lint ${lintFilters.join(" ")}`);
  }

  if (typecheckFilters.length > 0) {
    deps.exec(`pnpm exec turbo typecheck ${typecheckFilters.join(" ")}`);
  }

  if (coverageFilters.length > 0) {
    deps.exec(
      `pnpm exec turbo test:coverage --concurrency=1 ${coverageFilters.join(" ")}`,
    );
  }

  if (runScriptsTypecheck) {
    deps.exec(
      "pnpm --filter @kaiplan/marketing-api exec tsc -p ../../scripts/tsconfig.json --noEmit",
    );
  }

  if (runScriptsTests) {
    deps.exec("pnpm exec vitest run --config scripts/vitest.config.ts");
  }

  deps.log("\nAll checks passed.");
}
