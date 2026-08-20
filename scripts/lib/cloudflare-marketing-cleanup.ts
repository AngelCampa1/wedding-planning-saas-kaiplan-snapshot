import { buildPnpmInvocation } from "./pnpm-invocation";

export const CANONICAL_MARKETING_PROJECT = "kaiplan-web";
export const STALE_MARKETING_PROJECT_NAMES = new Set([
  CANONICAL_MARKETING_PROJECT,
  "kaiplan",
  "kaiplan-app",
  "ideas-validation",
  "kaiplan-marketing",
  "old-kaiplan-marketing",
]);

export interface CleanupArgs {
  dryRun: boolean;
  projects: string[];
}

export interface CleanupCommand {
  executable: string;
  args: string[];
}

export interface CloudflarePagesProject {
  "Project Name"?: string;
  "Project Domains"?: string;
}

export function parseCleanupArgs(argv: string[]): CleanupArgs {
  const args: CleanupArgs = {
    dryRun: false,
    projects: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--project") {
      const project = argv[index + 1]?.trim();
      if (!project) {
        throw new Error("--project requires a Cloudflare Pages project name");
      }
      args.projects.push(project);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

export function assertCloudflareApiToken(
  env: NodeJS.ProcessEnv,
): asserts env is NodeJS.ProcessEnv & { CLOUDFLARE_API_TOKEN: string } {
  if (!env.CLOUDFLARE_API_TOKEN?.trim()) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN is required for non-interactive Cloudflare cleanup.",
    );
  }
}

export function validateCleanupProjects(projects: string[]): string[] {
  const uniqueProjects = Array.from(new Set(projects.map((p) => p.trim())));

  if (uniqueProjects.length === 0) {
    throw new Error(
      "Pass at least one stale Pages project with --project. The script lists projects first and deletes only explicit names.",
    );
  }

  const unsafeProject = uniqueProjects.find(
    (project) => !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(project),
  );
  if (unsafeProject) {
    throw new Error(
      `Refusing unsafe Cloudflare Pages project name: ${unsafeProject}`,
    );
  }

  return uniqueProjects;
}

export function buildCleanupCommands(
  projects: string[],
  platform = process.platform,
  comspec = process.env.ComSpec,
): CleanupCommand[] {
  const validatedProjects = validateCleanupProjects(projects);
  const listCommand = buildPnpmInvocation(
    ["exec", "wrangler", "pages", "project", "list", "--json"],
    platform,
    comspec,
  );
  return [
    listCommand,
    ...validatedProjects.map((project) =>
      buildPnpmInvocation(
        ["exec", "wrangler", "pages", "project", "delete", project, "--yes"],
        platform,
        comspec,
      ),
    ),
  ];
}

export function formatCleanupCommand(command: CleanupCommand): string {
  return [command.executable, ...command.args].join(" ");
}

export function getProjectName(project: CloudflarePagesProject): string {
  return project["Project Name"]?.trim() ?? "";
}

export function findStaleMarketingProjects(
  projects: CloudflarePagesProject[],
): string[] {
  return projects
    .map((project) => ({
      name: getProjectName(project),
      domains: project["Project Domains"] ?? "",
    }))
    .filter(({ name, domains }) => {
      if (!name) {
        return false;
      }

      return (
        STALE_MARKETING_PROJECT_NAMES.has(name) ||
        domains
          .split(",")
          .map((domain) => domain.trim())
          .some(
            (domain) =>
              domain === "kaiplan.app" ||
              domain === "www.kaiplan.app" ||
              domain === "my.kaiplan.app",
          )
      );
    })
    .map(({ name }) => name)
    .sort();
}

export function assertOnlyCanonicalMarketingProject(
  projects: CloudflarePagesProject[],
): void {
  const staleProjects = findStaleMarketingProjects(projects);
  if (staleProjects.length > 0) {
    throw new Error(
      `Stale Kaiplan Pages project(s) still exist: ${staleProjects.join(", ")}`,
    );
  }
}

export function assertCleanupProjectsMatchStaleInventory(
  requestedProjects: string[],
  projects: CloudflarePagesProject[],
): void {
  const requested = validateCleanupProjects(requestedProjects);
  const staleProjectNames = findStaleMarketingProjects(projects);
  const staleProjects = new Set(staleProjectNames);
  const nonStaleProject = requested.find(
    (project) => !staleProjects.has(project),
  );

  if (nonStaleProject) {
    throw new Error(
      `Refusing to delete ${nonStaleProject} because it is not detected as a stale Kaiplan Pages project.`,
    );
  }

  const requestedSet = new Set(requested);
  const missingProject = staleProjectNames.find(
    (project) => !requestedSet.has(project),
  );

  if (missingProject || requested.length !== staleProjectNames.length) {
    throw new Error(
      `Requested Pages projects must match stale Kaiplan Pages inventory exactly: ${staleProjectNames.join(", ")}`,
    );
  }
}
