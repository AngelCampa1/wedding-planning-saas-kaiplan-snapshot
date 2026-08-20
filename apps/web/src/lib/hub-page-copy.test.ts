import { describe, expect, it } from "vitest";
import {
  getKaiplanAlternativesHubCopy,
  getKaiplanBestAppsHubCopy,
  getKaiplanCompareHubCopy,
  getKaiplanGuidesHubCopy,
  getKaiplanPricingHubCopy,
  getKaiplanResourcesHubCopy,
  getKaiplanVersusHubCopy,
} from "./hub-page-copy";

describe("getKaiplanCompareHubCopy", () => {
  it("returns wedding-specific FAQ headings and richer hub copy", () => {
    const copy = getKaiplanCompareHubCopy();

    expect(copy.title).toBe("Compare Wedding Planning Software");
    expect(copy.description).toContain("wedding planning software");
    expect(copy.description).toContain("vendor ads");
    expect(copy.faqHeading).toBe("Wedding planning comparison questions");
    expect(copy.ctaHeading).toBe("Ready to plan without vendor pressure?");
  });
});

describe("getKaiplanResourcesHubCopy", () => {
  it("returns a longer SEO title and wedding-specific FAQ heading", () => {
    const copy = getKaiplanResourcesHubCopy();

    expect(copy.title).toBe("Wedding Planning Resources & Guides");
    expect(copy.description).toContain("wedding planning guides");
    expect(copy.description).toContain("vendor ads");
    expect(copy.faqHeading).toBe("Wedding planning guide questions");
    expect(copy.ctaHeading).toBe("Want a calmer way to plan the budget?");
  });
});

describe("other Kaiplan hub copy factories", () => {
  it("returns wedding-specific alternatives hub copy", () => {
    const copy = getKaiplanAlternativesHubCopy();

    expect(copy.title).toBe("Wedding Planning Software Alternatives");
    expect(copy.faqHeading).toBe("Wedding planning alternative questions");
    expect(copy.ctaButtonText).toBe("Start planning with Kaiplan");
  });

  it("returns wedding-specific comparisons hub copy", () => {
    const copy = getKaiplanVersusHubCopy();

    expect(copy.title).toBe("Wedding Planning Software Comparisons");
    expect(copy.description).toContain("workflow fit");
    expect(copy.faqHeading).toBe("Wedding planning comparison questions");
  });

  it("returns wedding-specific pricing hub copy", () => {
    const copy = getKaiplanPricingHubCopy();

    expect(copy.title).toBe("Wedding Planning Pricing Breakdowns");
    expect(copy.description).toContain("hidden fees");
    expect(copy.faqHeading).toBe("Wedding planning pricing questions");
  });

  it("returns wedding-specific best-apps and guides hub copy", () => {
    const bestApps = getKaiplanBestAppsHubCopy();
    const guides = getKaiplanGuidesHubCopy();

    expect(bestApps.title).toBe("Best Wedding Planning Apps");
    expect(bestApps.faqHeading).toBe("Best wedding planning app questions");
    expect(guides.title).toBe("Wedding Planning Guides");
    expect(guides.faqHeading).toBe("Wedding planning guide questions");
  });
});
