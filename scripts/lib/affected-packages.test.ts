import { describe, expect, it, vi } from "vitest";
import {
  buildFilterArgs,
  discoverPackages,
  getAffectedPackages,
  main,
  mapFileToPackage,
  type PackageMap,
  type AffectedPackage,
  type Deps,
  type FsDeps,
} from "./affected-packages";

describe("buildFilterArgs", () => {
  it("returns lint, typecheck, coverage, and scripts filters for affected packages", () => {
    const affected: AffectedPackage[] = [
      {
        name: "@kaiplan/app",
        dir: "apps/app",
        scripts: {
          lint: "eslint src",
          typecheck: "tsc --noEmit",
          "test:coverage": "vitest run --coverage",
        },
      },
      {
        name: "__scripts__",
        dir: "scripts",
        scripts: {},
      },
    ];

    expect(buildFilterArgs(affected)).toEqual({
      lintFilters: ["--filter=@kaiplan/app"],
      typecheckFilters: ["--filter=@kaiplan/app"],
      coverageFilters: ["--filter=@kaiplan/app"],
      runScriptsTests: true,
      runScriptsTypecheck: true,
    });
  });

  it("skips lint/typecheck/coverage filters for packages without those scripts", () => {
    const affected: AffectedPackage[] = [
      {
        name: "@kaiplan/minimal",
        dir: "apps/minimal",
        scripts: {}, // no lint, typecheck, or test:coverage
      },
    ];

    expect(buildFilterArgs(affected)).toEqual({
      lintFilters: [],
      typecheckFilters: [],
      coverageFilters: [],
      runScriptsTests: false,
      runScriptsTypecheck: false,
    });
  });
});

describe("main", () => {
  const packages: PackageMap = {
    "apps/app": {
      name: "@kaiplan/app",
      scripts: {
        lint: "eslint src",
        typecheck: "tsc --noEmit",
        "test:coverage": "vitest run --coverage",
      },
    },
  };

  function createDeps(stagedFiles: string[]): {
    deps: Deps;
    exec: ReturnType<typeof vi.fn<(command: string) => void>>;
    log: ReturnType<typeof vi.fn<(message: string) => void>>;
    exit: ReturnType<typeof vi.fn<(code: number) => void>>;
  } {
    const exec = vi.fn<(command: string) => void>();
    const log = vi.fn<(message: string) => void>();
    const exit = vi.fn<(code: number) => void>();

    return {
      exec,
      log,
      exit,
      deps: {
        getStagedFiles: () => stagedFiles,
        discoverPackages: () => packages,
        exec,
        log,
        exit,
        cwd: () => "C:/repo",
      },
    };
  }

  it("runs lint, typecheck, and coverage for affected packages in order", () => {
    const { deps, exec, log } = createDeps(["apps/app/src/main.tsx"]);

    main(deps);

    expect(exec.mock.calls).toEqual([
      ["pnpm exec turbo lint --filter=@kaiplan/app"],
      ["pnpm exec turbo typecheck --filter=@kaiplan/app"],
      ["pnpm exec turbo test:coverage --concurrency=1 --filter=@kaiplan/app"],
    ]);
    expect(log).toHaveBeenCalledWith("Affected packages: @kaiplan/app");
  });

  it("runs the scripts vitest suite when scripts are staged", () => {
    const { exec, log, exit } = createDeps(["scripts/run-affected-checks.ts"]);
    const deps: Deps = {
      getStagedFiles: () => ["scripts/run-affected-checks.ts"],
      discoverPackages: () => ({}),
      exec,
      log,
      exit,
      cwd: () => "C:/repo",
    };

    main(deps);

    expect(exec.mock.calls).toEqual([
      [
        "pnpm --filter @kaiplan/marketing-api exec tsc -p ../../scripts/tsconfig.json --noEmit",
      ],
      ["pnpm exec vitest run --config scripts/vitest.config.ts"],
    ]);
  });

  it("skips checks when e2e files are staged (E2E requires live servers)", () => {
    const { deps, exec, log, exit } = createDeps([
      "e2e/tests/local-full-flow.spec.ts",
    ]);

    main(deps);

    expect(exec).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "No workspace packages affected. Skipping checks.",
    );
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("skips checks when there are no staged files", () => {
    const { deps, exec, exit, log } = createDeps([]);

    main(deps);

    expect(exec).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "No staged files. Skipping package-level checks.",
    );
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("treats root-level quality gate files as affecting every package", () => {
    expect(getAffectedPackages(["eslint.config.js"], packages)).toEqual([
      {
        name: "@kaiplan/app",
        dir: "apps/app",
        scripts: {
          lint: "eslint src",
          typecheck: "tsc --noEmit",
          "test:coverage": "vitest run --coverage",
        },
      },
    ]);
  });

  it("runs scripts tests when the root-level scripts vitest config is staged", () => {
    const { exec, log, exit } = createDeps(["scripts/vitest.config.ts"]);
    const deps: Deps = {
      getStagedFiles: () => ["scripts/vitest.config.ts"],
      discoverPackages: () => packages,
      exec,
      log,
      exit,
      cwd: () => "C:/repo",
    };

    main(deps);

    expect(exec.mock.calls).toEqual([
      ["pnpm exec turbo lint --filter=@kaiplan/app"],
      ["pnpm exec turbo typecheck --filter=@kaiplan/app"],
      ["pnpm exec turbo test:coverage --concurrency=1 --filter=@kaiplan/app"],
      [
        "pnpm --filter @kaiplan/marketing-api exec tsc -p ../../scripts/tsconfig.json --noEmit",
      ],
      ["pnpm exec vitest run --config scripts/vitest.config.ts"],
    ]);
  });

  it("runs scripts checks when the scripts tsconfig is staged", () => {
    const { exec, log, exit } = createDeps(["scripts/tsconfig.json"]);
    const deps: Deps = {
      getStagedFiles: () => ["scripts/tsconfig.json"],
      discoverPackages: () => packages,
      exec,
      log,
      exit,
      cwd: () => "C:/repo",
    };

    main(deps);

    expect(exec.mock.calls).toEqual([
      ["pnpm exec turbo lint --filter=@kaiplan/app"],
      ["pnpm exec turbo typecheck --filter=@kaiplan/app"],
      ["pnpm exec turbo test:coverage --concurrency=1 --filter=@kaiplan/app"],
      [
        "pnpm --filter @kaiplan/marketing-api exec tsc -p ../../scripts/tsconfig.json --noEmit",
      ],
      ["pnpm exec vitest run --config scripts/vitest.config.ts"],
    ]);
  });

  it("runs scripts checks when the root package scripts are staged", () => {
    const { exec, log, exit } = createDeps(["package.json"]);
    const deps: Deps = {
      getStagedFiles: () => ["package.json"],
      discoverPackages: () => packages,
      exec,
      log,
      exit,
      cwd: () => "C:/repo",
    };

    main(deps);

    expect(exec.mock.calls).toEqual([
      ["pnpm exec turbo lint --filter=@kaiplan/app"],
      ["pnpm exec turbo typecheck --filter=@kaiplan/app"],
      ["pnpm exec turbo test:coverage --concurrency=1 --filter=@kaiplan/app"],
      [
        "pnpm --filter @kaiplan/marketing-api exec tsc -p ../../scripts/tsconfig.json --noEmit",
      ],
      ["pnpm exec vitest run --config scripts/vitest.config.ts"],
    ]);
  });

  it("treats pnpm-lock.yaml as affecting every package", () => {
    expect(getAffectedPackages(["pnpm-lock.yaml"], packages)).toEqual([
      {
        name: "@kaiplan/app",
        dir: "apps/app",
        scripts: {
          lint: "eslint src",
          typecheck: "tsc --noEmit",
          "test:coverage": "vitest run --coverage",
        },
      },
    ]);
  });

  it("treats staged e2e files as no-ops in pre-commit (E2E runs in CI)", () => {
    expect(
      getAffectedPackages(["e2e/tests/local-full-flow.spec.ts"], packages),
    ).toEqual([]);
  });
});

describe("mapFileToPackage", () => {
  const packages: PackageMap = {
    "apps/app": {
      name: "@kaiplan/app",
      scripts: { lint: "eslint src" },
    },
  };

  it("returns null for a file that matches no package and is not scripts or e2e", () => {
    expect(mapFileToPackage("some-other-dir/foo.ts", packages)).toBeNull();
  });

  it("maps scripts/ files to __scripts__ sentinel", () => {
    expect(mapFileToPackage("scripts/foo.ts", packages)).toEqual({
      name: "__scripts__",
      dir: "scripts",
      scripts: {},
    });
  });

  it("normalises Windows backslash paths before matching", () => {
    expect(mapFileToPackage("apps\\app\\src\\main.tsx", packages)).toEqual({
      name: "@kaiplan/app",
      dir: "apps/app",
      scripts: { lint: "eslint src" },
    });
  });
});

describe("discoverPackages", () => {
  function makeFsDeps(
    entries: Record<string, string[]>,
    files: Record<string, string>,
  ): FsDeps {
    return {
      readdirSync: (p: string) => {
        const key = p.replace(/\\/g, "/");
        if (key in entries) return entries[key];
        throw new Error(`ENOENT: ${p}`);
      },
      readFileSync: (p: string, _enc: string) => {
        const key = p.replace(/\\/g, "/");
        if (key in files) return files[key];
        throw new Error(`ENOENT: ${p}`);
      },
    };
  }

  it("discovers packages from apps and packages workspace dirs", () => {
    const fs = makeFsDeps(
      { "/repo/apps": ["app"], "/repo/packages": ["shared"] },
      {
        "/repo/apps/app/package.json": JSON.stringify({
          name: "@kaiplan/app",
          scripts: { lint: "eslint ." },
        }),
        "/repo/packages/shared/package.json": JSON.stringify({
          name: "@kaiplan/shared",
          scripts: { typecheck: "tsc" },
        }),
      },
    );

    expect(discoverPackages("/repo", fs)).toEqual({
      "apps/app": { name: "@kaiplan/app", scripts: { lint: "eslint ." } },
      "packages/shared": {
        name: "@kaiplan/shared",
        scripts: { typecheck: "tsc" },
      },
    });
  });

  it("falls back to directory name when package.json has no name field", () => {
    const fs = makeFsDeps(
      { "/repo/apps": ["my-pkg"], "/repo/packages": [] },
      {
        "/repo/apps/my-pkg/package.json": JSON.stringify({ scripts: {} }),
      },
    );

    const result = discoverPackages("/repo", fs);
    expect(result["apps/my-pkg"].name).toBe("my-pkg");
  });

  it("uses empty scripts object when parsed.scripts is not a plain object (L21 type guard)", () => {
    const fs = makeFsDeps(
      { "/repo/apps": ["bad-pkg"], "/repo/packages": [] },
      {
        "/repo/apps/bad-pkg/package.json": JSON.stringify({
          name: "@bad/pkg",
          scripts: "not-an-object",
        }),
      },
    );

    const result = discoverPackages("/repo", fs);
    expect(result["apps/bad-pkg"].scripts).toEqual({});
  });

  it("uses empty scripts object when parsed.scripts is null (L21 null guard)", () => {
    const fs = makeFsDeps(
      { "/repo/apps": ["null-scripts"], "/repo/packages": [] },
      {
        "/repo/apps/null-scripts/package.json": JSON.stringify({
          name: "@null/scripts",
          scripts: null,
        }),
      },
    );

    const result = discoverPackages("/repo", fs);
    expect(result["apps/null-scripts"].scripts).toEqual({});
  });

  it("skips workspace dirs that do not exist on disk", () => {
    // Only /repo/apps exists; /repo/packages throws ENOENT
    const fs = makeFsDeps(
      { "/repo/apps": ["app"] },
      {
        "/repo/apps/app/package.json": JSON.stringify({ name: "@kaiplan/app" }),
      },
    );

    const result = discoverPackages("/repo", fs);
    expect(Object.keys(result)).toEqual(["apps/app"]);
  });

  it("skips entries whose package.json cannot be read or parsed", () => {
    const fs = makeFsDeps(
      { "/repo/apps": ["broken"], "/repo/packages": [] },
      {}, // no package.json file at all
    );

    const result = discoverPackages("/repo", fs);
    expect(result).toEqual({});
  });
});
