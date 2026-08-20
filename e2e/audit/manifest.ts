export type Surface = {
  slug: string;
  url: (ctx: {
    webBase: string;
    appBase: string;
    weddingSlug: string;
  }) => string;
  authed: boolean;
  description: string;
};

export const PUBLIC_WEB_SURFACES: Surface[] = [
  {
    slug: "web-home",
    url: (c) => `${c.webBase}/`,
    authed: false,
    description: "Marketing home",
  },
  {
    slug: "web-features",
    url: (c) => `${c.webBase}/features/`,
    authed: false,
    description: "Features page",
  },
  {
    slug: "web-pricing",
    url: (c) => `${c.webBase}/pricing/`,
    authed: false,
    description: "Pricing page",
  },
  {
    slug: "web-help",
    url: (c) => `${c.webBase}/help/`,
    authed: false,
    description: "Public help center",
  },
  {
    slug: "web-privacy",
    url: (c) => `${c.webBase}/privacy/`,
    authed: false,
    description: "Privacy policy",
  },
  {
    slug: "web-terms",
    url: (c) => `${c.webBase}/terms/`,
    authed: false,
    description: "Terms of service",
  },
  {
    slug: "web-404",
    url: (c) => `${c.webBase}/this-page-does-not-exist/`,
    authed: false,
    description: "404 page",
  },
  {
    slug: "web-free-budget-template",
    url: (c) => `${c.webBase}/free/budget-template/`,
    authed: false,
    description: "Free budget template",
  },
  {
    slug: "web-compare-index",
    url: (c) => `${c.webBase}/compare/`,
    authed: false,
    description: "Compare hub",
  },
  {
    slug: "web-compare-alt-knot",
    url: (c) => `${c.webBase}/compare/alternatives/the-knot/`,
    authed: false,
    description: "Alternative: The Knot",
  },
  {
    slug: "web-compare-pricing",
    url: (c) => `${c.webBase}/compare/pricing/free-vs-paid-wedding-apps/`,
    authed: false,
    description: "Pricing comparison",
  },
  {
    slug: "web-compare-versus",
    url: (c) => `${c.webBase}/compare/versus/the-knot-vs-zola/`,
    authed: false,
    description: "Versus comparison",
  },
  {
    slug: "web-resources-index",
    url: (c) => `${c.webBase}/resources/`,
    authed: false,
    description: "Resources hub",
  },
  {
    slug: "web-resources-best",
    url: (c) => `${c.webBase}/resources/best/best-wedding-planning-apps/`,
    authed: false,
    description: "Best apps roundup",
  },
  {
    slug: "web-resources-guide",
    url: (c) =>
      `${c.webBase}/resources/guides/wedding-planning-without-vendor-ads/`,
    authed: false,
    description: "Guide article",
  },
];

export const SPA_PUBLIC_SURFACES: Surface[] = [
  {
    slug: "app-root",
    url: (c) => `${c.appBase}/`,
    authed: false,
    description: "SPA root (likely redirect)",
  },
  {
    slug: "app-login",
    url: (c) => `${c.appBase}/login`,
    authed: false,
    description: "Login",
  },
  {
    slug: "app-signup",
    url: (c) => `${c.appBase}/signup`,
    authed: false,
    description: "Signup",
  },
  {
    slug: "app-forgot-password",
    url: (c) => `${c.appBase}/forgot-password`,
    authed: false,
    description: "Forgot password",
  },
  {
    slug: "app-reset-password",
    url: (c) => `${c.appBase}/reset-password`,
    authed: false,
    description: "Reset password (no token)",
  },
  {
    slug: "app-email-prefs",
    url: (c) => `${c.appBase}/email-preferences`,
    authed: false,
    description: "Email preferences (no token)",
  },
];

export const SPA_AUTHED_SURFACES: Surface[] = [
  {
    slug: "app-dashboard",
    url: (c) => `${c.appBase}/dashboard`,
    authed: true,
    description: "Planner dashboard",
  },
  {
    slug: "app-guests",
    url: (c) => `${c.appBase}/guests`,
    authed: true,
    description: "Guests",
  },
  {
    slug: "app-seating",
    url: (c) => `${c.appBase}/seating`,
    authed: true,
    description: "Seating",
  },
  {
    slug: "app-vendors",
    url: (c) => `${c.appBase}/vendors`,
    authed: true,
    description: "Vendors",
  },
  {
    slug: "app-budget",
    url: (c) => `${c.appBase}/budget`,
    authed: true,
    description: "Budget",
  },
  {
    slug: "app-website",
    url: (c) => `${c.appBase}/website`,
    authed: true,
    description: "Wedding website editor",
  },
  {
    slug: "app-checklist",
    url: (c) => `${c.appBase}/checklist`,
    authed: true,
    description: "Checklist",
  },
  {
    slug: "app-help",
    url: (c) => `${c.appBase}/help`,
    authed: true,
    description: "Planner help center",
  },
  {
    slug: "app-settings",
    url: (c) => `${c.appBase}/settings`,
    authed: true,
    description: "Settings",
  },
];

export const PUBLIC_WEDDING_SURFACES: Surface[] = [
  {
    slug: "wedding-public",
    url: (c) => `${c.webBase}/w/${c.weddingSlug}/`,
    authed: false,
    description: "Couple-facing wedding site",
  },
];

export const ALL_SURFACES: Surface[] = [
  ...PUBLIC_WEB_SURFACES,
  ...SPA_PUBLIC_SURFACES,
  ...SPA_AUTHED_SURFACES,
  ...PUBLIC_WEDDING_SURFACES,
];

export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
