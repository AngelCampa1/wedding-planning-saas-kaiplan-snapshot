import type { BreadcrumbItem } from "@kaiplan/marketing";

function ensureTrailingSlashPath(path: string): string {
  if (path === "/" || path === "" || path.includes("#") || path.includes("?")) {
    return path;
  }

  const segments = path.split("/");
  const lastSegment = segments[segments.length - 1] as string;
  if (lastSegment.includes(".")) {
    return path;
  }

  return path.endsWith("/") ? path : `${path}/`;
}

export function buildAlternativeBreadcrumbs(
  title: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Compare", href: "/compare/" },
    { label: "Alternatives", href: "/compare/alternatives/" },
    { label: title, href: ensureTrailingSlashPath(canonicalPath) },
  ];
}

export function buildComparisonBreadcrumbs(
  title: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Compare", href: "/compare/" },
    { label: "Comparisons", href: "/compare/versus/" },
    { label: title, href: ensureTrailingSlashPath(canonicalPath) },
  ];
}

export function buildPricingBreadcrumbs(
  title: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Compare", href: "/compare/" },
    { label: "Pricing", href: "/compare/pricing/" },
    { label: title, href: ensureTrailingSlashPath(canonicalPath) },
  ];
}

export function buildListicleBreadcrumbs(
  title: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Resources", href: "/resources/" },
    { label: "Best", href: "/resources/best/" },
    { label: title, href: ensureTrailingSlashPath(canonicalPath) },
  ];
}

export function buildGuideBreadcrumbs(
  title: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Resources", href: "/resources/" },
    { label: "Guides", href: "/resources/guides/" },
    { label: title, href: ensureTrailingSlashPath(canonicalPath) },
  ];
}
