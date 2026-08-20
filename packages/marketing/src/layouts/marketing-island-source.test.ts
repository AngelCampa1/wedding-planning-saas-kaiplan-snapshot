import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("marketing island wrapper source regressions", () => {
  it("renders the exit popup through a combined island component that includes the error boundary", () => {
    // exit-intent-popup.astro uses ExitIntentPopupIsland (a React component
    // that combines MarketingIslandBoundary + ExitIntentPopup in one React
    // tree). Astro's client:only renders slot children as static HTML without
    // event handlers, so putting client:only on the boundary and slotting the
    // popup as a child meant the popup never hydrated. The combined island
    // fixes that.
    const popupAstroSource = readSource(
      "../components/exit-intent-popup.astro",
    );
    const popupIslandSource = readSource(
      "../components/exit-intent-popup-island.tsx",
    );

    expect(popupAstroSource).toContain("./exit-intent-popup-island.tsx");
    expect(popupAstroSource).toContain('client:only="react"');
    expect(popupAstroSource).not.toContain("client:load");
    // The Astro wrapper must NOT slot the popup as a child of the boundary
    // (the original bug). The boundary belongs inside the island component.
    expect(popupAstroSource).not.toContain("marketing-island-boundary");
    // The island component (not the Astro wrapper) must import the boundary
    expect(popupIslandSource).toContain("./marketing-island-boundary");
    // The island component must render ExitIntentPopup inside the boundary
    expect(popupIslandSource).toContain("./exit-intent-popup");
  });

  it("renders the feedback widget through a combined island component that includes the error boundary", () => {
    // feedback-widget.astro uses FeedbackWidgetIsland (a React component that
    // combines MarketingIslandBoundary + FeedbackWidget in one React tree).
    // This avoids the Astro client:only slot hydration limitation where slot
    // children are rendered as static HTML without event handlers.
    const feedbackAstroSource = readSource(
      "../components/feedback-widget.astro",
    );
    const feedbackIslandSource = readSource(
      "../components/feedback-widget-island.tsx",
    );

    expect(feedbackAstroSource).toContain("./feedback-widget-island.tsx");
    expect(feedbackAstroSource).toContain('client:only="react"');
    expect(feedbackAstroSource).not.toContain("client:load");
    // The island component (not the Astro wrapper) must import the boundary
    expect(feedbackIslandSource).toContain("./marketing-island-boundary");
    // The island component must render FeedbackWidget inside the boundary
    expect(feedbackIslandSource).toContain("./feedback-widget");
  });

  it("routes marketing layouts through the Astro wrappers instead of the React files", () => {
    const baseLayoutSource = readSource("./base-layout.astro");
    const landingLayoutSource = readSource("./landing-layout.astro");
    const leadMagnetSource = readSource("../components/lead-magnet-page.astro");
    const contentHubSource = readSource("../hubs/content-hub.astro");
    const categoryHubSource = readSource("../hubs/category-hub.astro");
    const articleLayoutSource = readSource("./article-layout.astro");
    const contentLayoutSource = readSource("./content-layout.astro");
    const comparisonLayoutSource = readSource("./comparison-layout.astro");
    const listicleLayoutSource = readSource("./listicle-layout.astro");
    const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

    expect(baseLayoutSource).not.toContain(
      "https://widgets.ventoralabs.com/w/v1.js",
    );
    expect(baseLayoutSource).not.toContain('data-widget="feedback-button"');
    expect(baseLayoutSource).not.toContain("../components/feedback-widget.tsx");
    expect(baseLayoutSource).toContain("../components/feedback-widget.astro");
    expect(landingLayoutSource).not.toContain(
      "../components/theme-toggle.astro",
    );
    expect(landingLayoutSource).toContain(
      "../components/exit-intent-popup.astro",
    );
    expect(leadMagnetSource).not.toContain("./theme-toggle.astro");
    expect(leadMagnetSource).toContain("./exit-intent-popup.astro");
    expect(contentHubSource).not.toContain("../components/theme-toggle.astro");
    expect(categoryHubSource).not.toContain("../components/theme-toggle.astro");
    expect(articleLayoutSource).not.toContain(
      "../components/theme-toggle.astro",
    );
    expect(articleLayoutSource).toContain(
      "../components/exit-intent-popup.astro",
    );
    expect(contentLayoutSource).not.toContain(
      "../components/theme-toggle.astro",
    );
    expect(contentLayoutSource).toContain(
      "../components/exit-intent-popup.astro",
    );
    expect(comparisonLayoutSource).not.toContain(
      "../components/theme-toggle.astro",
    );
    expect(comparisonLayoutSource).toContain(
      "../components/exit-intent-popup.astro",
    );
    expect(listicleLayoutSource).not.toContain(
      "../components/theme-toggle.astro",
    );
    expect(listicleLayoutSource).toContain(
      "../components/exit-intent-popup.astro",
    );
    expect(pricingLayoutSource).not.toContain(
      "../components/theme-toggle.astro",
    );
    expect(pricingLayoutSource).toContain(
      "../components/exit-intent-popup.astro",
    );
  });

  it("routes public site pages through the Astro wrapper export", () => {
    const privacySource = readFileSync(
      resolve(currentDir, "../../../../apps/web/src/pages/privacy.astro"),
      "utf8",
    );
    const termsSource = readFileSync(
      resolve(currentDir, "../../../../apps/web/src/pages/terms.astro"),
      "utf8",
    );

    // Wave 5: privacy and terms were rebuilt to use LandingLayout, which
    // includes ThemeToggle internally. Pages no longer import the component
    // directly because the theme-toggle is wired through the layout.
    for (const source of [privacySource, termsSource]) {
      expect(source).toContain(
        "@kaiplan/marketing/layouts/landing-layout.astro",
      );
      expect(source).not.toContain(
        "@kaiplan/marketing/components/theme-toggle.tsx",
      );
    }
  });

  it("can disable remote font requests for local e2e browser diagnostics", () => {
    const baseLayoutSource = readSource("./base-layout.astro");
    const weddingPageSource = readFileSync(
      resolve(currentDir, "../../../../apps/web/src/pages/w/[slug].astro"),
      "utf8",
    );
    const appViteConfigSource = readFileSync(
      resolve(currentDir, "../../../../apps/app/vite.config.ts"),
      "utf8",
    );

    expect(baseLayoutSource).toContain("PUBLIC_DISABLE_REMOTE_FONTS");
    expect(weddingPageSource).toContain("PUBLIC_DISABLE_REMOTE_FONTS");
    expect(appViteConfigSource).toContain("VITE_DISABLE_REMOTE_FONTS");
  });

  it("does not re-export the SSR-sensitive React islands from the package root", () => {
    const indexSource = readSource("../index.ts");

    expect(indexSource).not.toContain(
      'export { ThemeToggle } from "./components/theme-toggle";',
    );
    expect(indexSource).not.toContain(
      'export { ExitIntentPopup } from "./components/exit-intent-popup";',
    );
  });

  it("routes GatedContent through a combined island component that includes the error boundary", () => {
    // lead-magnet-page.astro and apps/web free/[slug].astro use GatedContentIsland
    // (a React component that combines MarketingIslandBoundary + GatedContent in
    // one React tree). The Astro wrapper must NOT slot GatedContent as a child of
    // the boundary — the boundary belongs inside the island component.
    const leadMagnetSource = readSource("../components/lead-magnet-page.astro");
    const freeSlugSource = readFileSync(
      resolve(currentDir, "../../../../apps/web/src/pages/free/[slug].astro"),
      "utf8",
    );
    const gatedIslandSource = readSource(
      "../components/gated-content-island.tsx",
    );

    expect(leadMagnetSource).toContain("./gated-content-island");
    expect(leadMagnetSource).not.toContain("marketing-island-boundary");
    expect(freeSlugSource).toContain(
      "@kaiplan/marketing/components/gated-content-island",
    );
    expect(freeSlugSource).not.toContain("marketing-island-boundary");
    expect(gatedIslandSource).toContain("./marketing-island-boundary");
    expect(gatedIslandSource).toContain("./gated-content");
  });

  it("routes EmailCapture through a combined island component that includes the error boundary", () => {
    // inline-signup.astro uses EmailCaptureIsland (a React component that
    // combines MarketingIslandBoundary + EmailCapture in one React tree).
    const inlineSignupSource = readSource("../components/inline-signup.astro");
    const emailIslandSource = readSource(
      "../components/email-capture-island.tsx",
    );

    expect(inlineSignupSource).toContain("./email-capture-island");
    expect(inlineSignupSource).not.toContain("marketing-island-boundary");
    expect(emailIslandSource).toContain("./marketing-island-boundary");
    expect(emailIslandSource).toContain("./email-capture");
  });

  it("routes FilterChips through a combined island component that includes the error boundary", () => {
    // All five hub pages use FilterChipsIsland (a React component that
    // combines MarketingIslandBoundary + FilterChips in one React tree).
    const hubPages = [
      resolve(
        currentDir,
        "../../../../apps/web/src/pages/compare/versus/[...page].astro",
      ),
      resolve(
        currentDir,
        "../../../../apps/web/src/pages/compare/alternatives/[...page].astro",
      ),
      resolve(
        currentDir,
        "../../../../apps/web/src/pages/compare/pricing/[...page].astro",
      ),
      resolve(
        currentDir,
        "../../../../apps/web/src/pages/resources/guides/[...page].astro",
      ),
      resolve(
        currentDir,
        "../../../../apps/web/src/pages/resources/best/[...page].astro",
      ),
    ].map((path) => readFileSync(path, "utf8"));
    const filterIslandSource = readSource(
      "../components/filter-chips-island.tsx",
    );

    for (const source of hubPages) {
      expect(source).toContain(
        "@kaiplan/marketing/components/filter-chips-island",
      );
      expect(source).not.toContain("marketing-island-boundary");
    }
    expect(filterIslandSource).toContain("./marketing-island-boundary");
    expect(filterIslandSource).toContain("./filter-chips");
  });
});
