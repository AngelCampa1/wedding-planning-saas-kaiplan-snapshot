import { describe, expect, it } from "vitest";
import {
  assertCloudflareApiToken,
  assertCleanupProjectsMatchStaleInventory,
  assertOnlyCanonicalMarketingProject,
  buildCleanupCommands,
  findStaleMarketingProjects,
  parseCleanupArgs,
  validateCleanupProjects,
} from "./lib/cloudflare-marketing-cleanup";

describe("cloudflare marketing cleanup", () => {
  it("refuses to run without CLOUDFLARE_API_TOKEN", () => {
    expect(() => assertCloudflareApiToken({})).toThrow(
      "CLOUDFLARE_API_TOKEN is required",
    );
  });

  it("allows explicit frontend Pages project deletion after Workers cutover", () => {
    expect(validateCleanupProjects(["kaiplan-web", "kaiplan-app"])).toEqual([
      "kaiplan-web",
      "kaiplan-app",
    ]);
  });

  it("requires explicit stale project names", () => {
    expect(() => validateCleanupProjects([])).toThrow(
      "Pass at least one stale Pages project",
    );
  });

  it("lists projects before deleting explicit stale projects", () => {
    expect(buildCleanupCommands(["ideas-validation"], "linux")).toEqual([
      {
        executable: "pnpm",
        args: ["exec", "wrangler", "pages", "project", "list", "--json"],
      },
      {
        executable: "pnpm",
        args: [
          "exec",
          "wrangler",
          "pages",
          "project",
          "delete",
          "ideas-validation",
          "--yes",
        ],
      },
    ]);
  });

  it("uses cmd.exe on Windows for local cleanup commands", () => {
    expect(
      buildCleanupCommands(
        ["ideas-validation"],
        "win32",
        "C:\\Windows\\System32\\cmd.exe",
      )[0],
    ).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "pnpm.cmd",
        "exec",
        "wrangler",
        "pages",
        "project",
        "list",
        "--json",
      ],
    });
  });

  it("rejects project names that could alter shell commands or flags", () => {
    expect(() => validateCleanupProjects(["old-site --help"])).toThrow(
      "Refusing unsafe Cloudflare Pages project name",
    );
    expect(() => validateCleanupProjects(["old-site;kaiplan-web"])).toThrow(
      "Refusing unsafe Cloudflare Pages project name",
    );
  });

  it("parses repeated --project flags and dry-run mode", () => {
    expect(
      parseCleanupArgs([
        "--dry-run",
        "--project",
        "ideas-validation",
        "--project",
        "old-kaiplan-marketing",
      ]),
    ).toEqual({
      dryRun: true,
      projects: ["ideas-validation", "old-kaiplan-marketing"],
    });
  });

  it("detects stale Kaiplan Pages projects by name and domain", () => {
    expect(
      findStaleMarketingProjects([
        {
          "Project Name": "kaiplan-web",
          "Project Domains": "kaiplan-web.pages.dev",
        },
        {
          "Project Name": "kaiplan-app",
          "Project Domains": "kaiplan-app.pages.dev, my.kaiplan.app",
        },
        {
          "Project Name": "kaiplan",
          "Project Domains": "kaiplan.pages.dev, kaiplan.app",
        },
        {
          "Project Name": "unrelated",
          "Project Domains": "unrelated.pages.dev",
        },
      ]),
    ).toEqual(["kaiplan", "kaiplan-app", "kaiplan-web"]);
  });

  it("requires all Kaiplan frontend Pages projects to be gone", () => {
    expect(() =>
      assertOnlyCanonicalMarketingProject([
        {
          "Project Name": "kaiplan",
          "Project Domains": "kaiplan.pages.dev, kaiplan.app",
        },
      ]),
    ).toThrow("Stale Kaiplan Pages project");

    expect(() =>
      assertOnlyCanonicalMarketingProject([
        {
          "Project Name": "kaiplan-web",
          "Project Domains": "kaiplan-web.pages.dev",
        },
        {
          "Project Name": "kaiplan",
          "Project Domains": "kaiplan.pages.dev, kaiplan.app",
        },
      ]),
    ).toThrow("Stale Kaiplan Pages project");

    expect(() =>
      assertOnlyCanonicalMarketingProject([
        {
          "Project Name": "unrelated",
          "Project Domains": "unrelated.pages.dev",
        },
      ]),
    ).not.toThrow();
  });

  it("refuses to delete projects that are not detected stale marketing projects", () => {
    expect(() =>
      assertCleanupProjectsMatchStaleInventory(
        ["unrelated"],
        [
          {
            "Project Name": "kaiplan",
            "Project Domains": "kaiplan.pages.dev, kaiplan.app",
          },
          {
            "Project Name": "unrelated",
            "Project Domains": "unrelated.pages.dev",
          },
        ],
      ),
    ).toThrow("not detected as a stale Kaiplan Pages project");
  });

  it("requires requested projects to exactly match stale inventory", () => {
    expect(() =>
      assertCleanupProjectsMatchStaleInventory(
        ["kaiplan-app"],
        [
          {
            "Project Name": "kaiplan-app",
            "Project Domains": "kaiplan-app.pages.dev, my.kaiplan.app",
          },
          {
            "Project Name": "kaiplan-web",
            "Project Domains": "kaiplan-web.pages.dev, kaiplan.app",
          },
        ],
      ),
    ).toThrow("must match stale Kaiplan Pages inventory");
  });
});
