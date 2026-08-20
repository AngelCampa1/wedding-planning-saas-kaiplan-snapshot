import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const astroPagePath = join("apps", "web", "src", "pages", "w", "[slug].astro");
describe("pre-commit tooling", () => {
  it("runs Playwright browser tests from the root verify script", () => {
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as {
      scripts?: {
        verify?: string;
      };
    };

    expect(packageJson.scripts?.verify).toContain("pnpm run e2e:browser");
  });

  it("formats Astro files from the repo root with Prettier", () => {
    expect(() =>
      execSync(`pnpm exec prettier "${astroPagePath}" --parser astro`, {
        cwd: repoRoot,
        encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("runs lint-staged without parallel child process fan-out", () => {
    const hook = readFileSync(join(repoRoot, ".husky", "pre-commit"), "utf8");

    expect(hook).toContain("pnpm exec lint-staged --concurrent false");
  });

  it("passes a timeout to execSync in run-affected-checks to prevent hung pre-commit hooks", () => {
    const script = readFileSync(
      join(repoRoot, "scripts", "run-affected-checks.ts"),
      "utf8",
    );

    // The exec callback must forward a timeout so a hung child process cannot
    // block git commit indefinitely. 1200 s covers full workspace coverage runs
    // on slow single-threaded Windows environments.
    expect(script).toContain("timeout: 1_200_000");
  });

  it("does not keep GitHub Actions workflow files in the repository", () => {
    const workflowsDir = join(repoRoot, ".github", "workflows");
    const workflowFiles = existsSync(workflowsDir)
      ? readdirSync(workflowsDir).filter((file) => /\.ya?ml$/i.test(file))
      : [];

    expect(workflowFiles).toEqual([]);
  });

  it("documents that grant-local-paid-plan uses quote-doubling SQL escaping and bounded psql execution", () => {
    const script = readFileSync(
      join(repoRoot, "scripts", "grant-local-paid-plan.ts"),
      "utf8",
    );

    // Local dev script: runPsqlQuery routes through bounded spawnSync without
    // shell expansion, preventing hung Docker calls and shell injection.
    // SQL injection is mitigated by RFC-standard quote-doubling.
    expect(script).toContain("runPsqlQuery");
    expect(script).toContain("replace(/'/g, \"''\")");
  });

  it("keeps API operational scripts in Turbo typecheck and coverage cache inputs", () => {
    const turbo = JSON.parse(
      readFileSync(join(repoRoot, "turbo.json"), "utf8"),
    ) as {
      tasks?: Record<string, { inputs?: string[] }>;
    };

    expect(turbo.tasks?.typecheck?.inputs).toEqual(
      expect.arrayContaining(["scripts/**/*.ts", "__tests__/scripts/**/*.ts"]),
    );
    expect(turbo.tasks?.["test:coverage"]?.inputs).toEqual(
      expect.arrayContaining(["scripts/**/*.ts", "__tests__/scripts/**/*.ts"]),
    );
  });

  it("typechecks every active root script file", () => {
    const tsconfig = JSON.parse(
      readFileSync(join(repoRoot, "scripts", "tsconfig.json"), "utf8"),
    ) as {
      include?: string[];
      exclude?: string[];
    };
    const included = new Set(tsconfig.include ?? []);
    const excluded = new Set(tsconfig.exclude ?? []);
    const scriptFiles = readdirSync(join(repoRoot, "scripts"))
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => !excluded.has(file));

    expect(included).toContain("*.ts");
    for (const file of scriptFiles) {
      expect(included.has(file) || included.has("*.ts")).toBe(true);
    }
  });
});
