import type { BreadcrumbItem } from "../types";
import { ensureTrailingSlash } from "./meta";

interface BuildLeadMagnetBreadcrumbsOptions {
  title: string;
  canonicalPath: string;
  hubLabel?: string;
  hubHref?: string;
}

export function buildLeadMagnetBreadcrumbs({
  title,
  canonicalPath,
  hubLabel,
  hubHref,
}: BuildLeadMagnetBreadcrumbsOptions): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];

  if (hubLabel && hubHref) {
    breadcrumbs.push({ label: hubLabel, href: ensureTrailingSlash(hubHref) });
  }

  breadcrumbs.push({ label: title, href: ensureTrailingSlash(canonicalPath) });

  return breadcrumbs;
}
