export type WorkerRouteEntry =
  | { pattern: string; zone_name: string }
  | { pattern: string; zone_id: string }
  | { pattern: string; custom_domain: boolean };

export function mergeWorkerRoutes(
  generatedConfig: Record<string, unknown>,
  routes: WorkerRouteEntry[],
): Record<string, unknown> {
  if (!routes.length) return generatedConfig;
  return { ...generatedConfig, routes };
}

export function extractWorkerRoutes(
  userConfig: Record<string, unknown>,
): WorkerRouteEntry[] {
  const raw = userConfig["routes"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is WorkerRouteEntry => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (typeof e["pattern"] !== "string") return false;
    return (
      typeof e["zone_name"] === "string" ||
      typeof e["zone_id"] === "string" ||
      e["custom_domain"] === true
    );
  });
}
