import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN_PRICING, TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import {
  auditKaiplanContentConsistency,
  auditPrivacyConsistency,
  type ContentConsistencyFile,
} from "./content-consistency";

function makeFile(
  relativePath: string,
  contents: string,
): ContentConsistencyFile {
  return { relativePath, contents };
}

const webRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repoRoot = resolve(webRoot, "../..");

const sourceCorpusExclusions = [
  /\.test\.(astro|ts|tsx)$/,
  /\.spec\.(astro|ts|tsx)$/,
  /content-consistency\.ts$/,
];

function collectSourceFiles(
  root: string,
  baseRoot = webRoot,
): ContentConsistencyFile[] {
  if (!existsSync(root)) {
    return [];
  }

  const files: ContentConsistencyFile[] = [];
  for (const entry of readdirSync(root)) {
    const path = resolve(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(path, baseRoot));
      continue;
    }

    if (!/\.(astro|md|mdx|ts|tsx)$/.test(path)) {
      continue;
    }

    const relativePath = relative(baseRoot, path).replaceAll("\\", "/");
    if (sourceCorpusExclusions.some((pattern) => pattern.test(relativePath))) {
      continue;
    }

    files.push({
      relativePath,
      contents: readFileSync(path, "utf8"),
    });
  }

  return files;
}

describe("auditKaiplanContentConsistency", () => {
  it("reports stale pricing references in source content", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/pricing.md",
        "Kaiplan starts at $20/mo or $79 lifetime.",
      ),
      makeFile(
        "src/content/guides/old-pricing.md",
        "Kaiplan starts at $20/mo or $100 lifetime for couples planning one wedding.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/pricing.md",
        message: "Found stale Kaiplan pricing language: $79",
      },
    ]);
  });

  it("allows current Kaiplan prices in public copy", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/list-price.md",
        "Kaiplan Starter $20/mo, Pro $35/mo, Lifetime $100 one-time. Kaiplan offers $20/month (Starter), $35/month (Pro), or $100 one-time (Lifetime).",
      ),
    ]);

    expect(result).toEqual([]);
  });

  it("verifies current Kaiplan plan prices against shared pricing", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/current-pricing.md",
        [
          `Kaiplan Starter is ${PLAN_PRICING.starter.price}.`,
          `Kaiplan Pro is ${PLAN_PRICING.pro.price}.`,
          `Kaiplan Lifetime costs ${PLAN_PRICING.lifetime.price}.`,
        ].join(" "),
      ),
    ]);

    expect(result).toEqual([]);
  });

  it("reports noncanonical current Kaiplan plan prices", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/wrong-pricing.md",
        "Kaiplan Starter is $21/mo. Kaiplan Pro is $36/mo. Kaiplan Lifetime costs $101.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/wrong-pricing.md",
        message: "Found noncanonical Kaiplan Starter price: $21",
      },
      {
        relativePath: "src/content/guides/wrong-pricing.md",
        message: "Found noncanonical Kaiplan Pro price: $36",
      },
      {
        relativePath: "src/content/guides/wrong-pricing.md",
        message: "Found noncanonical Kaiplan Lifetime price: $101",
      },
    ]);
  });

  it("reports noncanonical price-before-plan Kaiplan claims", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/wrong-reverse-pricing.md",
        "Kaiplan starts at $21/month on the Starter plan, $36/month on Pro, or $101 as a lifetime plan.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/wrong-reverse-pricing.md",
        message: "Found noncanonical Kaiplan Starter price: $21",
      },
      {
        relativePath: "src/content/guides/wrong-reverse-pricing.md",
        message: "Found noncanonical Kaiplan Pro price: $36",
      },
      {
        relativePath: "src/content/guides/wrong-reverse-pricing.md",
        message: "Found noncanonical Kaiplan Lifetime price: $101",
      },
      {
        relativePath: "src/content/guides/wrong-reverse-pricing.md",
        message: "Found noncanonical Kaiplan starting price: $21",
      },
    ]);
  });

  it("reports noncanonical parenthetical Kaiplan plan prices", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/stale-parenthetical-pricing.md",
        "Kaiplan offers $22/month (Starter), $38/month (Pro), or $105 one-time (Lifetime).",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/stale-parenthetical-pricing.md",
        message: "Found noncanonical Kaiplan Starter price: $22",
      },
      {
        relativePath: "src/content/guides/stale-parenthetical-pricing.md",
        message: "Found noncanonical Kaiplan Pro price: $38",
      },
      {
        relativePath: "src/content/guides/stale-parenthetical-pricing.md",
        message: "Found noncanonical Kaiplan Lifetime price: $105",
      },
    ]);
  });

  it("verifies Kaiplan trial length against the shared trial duration", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/pages/features.astro",
        `New accounts start with a ${TRIAL_DURATION_DAYS}-day free trial with full app access.`,
      ),
      makeFile(
        "src/pages/old-features.astro",
        "New accounts start with a 14-day free trial with full app access.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/pages/old-features.astro",
        message: "Found noncanonical Kaiplan trial length: 14-day",
      },
    ]);
  });

  it("ignores competitor pricing ranges that include $79", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/pricing-breakdowns/the-knot-hidden-costs-vendor-ads.md",
        "Vendor Basic Listing (paid by vendor): $29-$79/month (estimated).",
      ),
    ]);

    expect(result).toEqual([]);
  });

  it("reports cross-site B2B copy leaks in rendered output", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "dist/resources/index.html",
        "<h2>Answers for teams evaluating the fit</h2>",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "dist/resources/index.html",
        message:
          "Found off-brand B2B language: Answers for teams evaluating the fit",
      },
    ]);
  });

  it("reports stale launch-state copy in config and pages", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/config/site.ts",
        'ctaText: "Choose your plan"\nsubtitle: "Start your 1-month free trial. No credit card required."',
      ),
      makeFile(
        "src/pages/terms.astro",
        "<p>Your free trial gives you full access to Kaiplan for 30 days.</p>",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/config/site.ts",
        message: "Found stale launch-state copy: choose your plan",
      },
      {
        relativePath: "src/config/site.ts",
        message: "Found stale launch-state copy: card required",
      },
      {
        relativePath: "src/config/site.ts",
        message: "Found stale launch-state copy: Start your 1-month free trial",
      },
      {
        relativePath: "src/pages/terms.astro",
        message: "Found stale launch-state copy: Your free trial",
      },
    ]);
  });

  it("reports checkout-first trial language as stale conversion copy", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/config/site.ts",
        "Starter and Pro include a 30-day free trial with card required at checkout.",
      ),
      makeFile(
        "src/lib/homepage.ts",
        "Create your account, choose the plan that fits your engagement, and continue into checkout.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/config/site.ts",
        message: "Found stale launch-state copy: card required",
      },
      {
        relativePath: "src/lib/homepage.ts",
        message: "Found stale launch-state copy: choose the plan",
      },
      {
        relativePath: "src/lib/homepage.ts",
        message: "Found stale launch-state copy: continue into checkout",
      },
    ]);
  });

  it("reports waitlist language as stale conversion copy", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/lib/guide-inline-signup.ts",
        'buttonText: "Join waitlist"\nsubtitle: "This waitlist opens by waitlist cohort."',
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/lib/guide-inline-signup.ts",
        message: "Found stale launch-state copy: join waitlist",
      },
      {
        relativePath: "src/lib/guide-inline-signup.ts",
        message: "Found stale launch-state copy: waitlist cohort",
      },
    ]);
  });

  it("reports stale product-state copy", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/lead-magnets/vendor-red-flag-checklist.md",
        "Kaiplan's vendor management module is coming in the Pro tier at $35/mo. It's not built yet.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/lead-magnets/vendor-red-flag-checklist.md",
        message: "Found stale product-state copy: coming in the Pro tier",
      },
      {
        relativePath: "src/content/lead-magnets/vendor-red-flag-checklist.md",
        message: "Found stale product-state copy: not built yet",
      },
    ]);
  });

  it("reports stale Kaiplan free-tier copy without flagging competitors", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/kaiplan-features-overview.md",
        "Kaiplan offers a free tier that lets you explore the interface.",
      ),
      makeFile(
        "src/content/pricing-breakdowns/withjoy-pricing.md",
        "Withjoy's free tier covers the core website use case.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/kaiplan-features-overview.md",
        message: "Found stale product-state copy: Kaiplan free tier",
      },
    ]);
  });

  it("reports stale launch-discount pricing", () => {
    const staleStarterPrice = `$${10}/mo`;
    const staleProPrice = `$${(17.5).toFixed(2)}/mo`;
    const staleLifetimePrice = `$${50}`;
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/old-launch-pricing.md",
        `Kaiplan Starter was ${staleStarterPrice}, Pro was ${staleProPrice}, and lifetime access was ${staleLifetimePrice} before current pricing.`,
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/old-launch-pricing.md",
        message: `Found stale Kaiplan pricing language: ${staleStarterPrice}`,
      },
      {
        relativePath: "src/content/guides/old-launch-pricing.md",
        message: `Found stale Kaiplan pricing language: ${staleProPrice}`,
      },
      {
        relativePath: "src/content/guides/old-launch-pricing.md",
        message: `Found stale Kaiplan pricing language: ${staleLifetimePrice}`,
      },
    ]);
  });

  it("reports noncanonical generic Kaiplan starting-price language", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/stale-starting-price.md",
        "Kaiplan starts at $22/mo or $100 lifetime for couples planning one wedding.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/stale-starting-price.md",
        message: "Found noncanonical Kaiplan starting price: $22",
      },
    ]);
  });

  it("reports noncanonical table-style plan pricing", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/stale-table-pricing.md",
        "| Kaiplan Starter ($22/mo x 15 months) | $330 |\n| Kaiplan Pro ($38/mo x 15 months) | $570 |",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/stale-table-pricing.md",
        message: "Found noncanonical Kaiplan Starter price: $22",
      },
      {
        relativePath: "src/content/guides/stale-table-pricing.md",
        message: "Found noncanonical Kaiplan Pro price: $38",
      },
    ]);
  });

  it("reports noncanonical generic Kaiplan monthly range pricing", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/stale-range-pricing.md",
        "Kaiplan also offers $22/mo and $38/mo plans for couples who prefer to start light. It starts at $22-$38/month, or $100 once.",
      ),
    ]);

    expect(result).toEqual([
      {
        relativePath: "src/content/guides/stale-range-pricing.md",
        message: "Found noncanonical Kaiplan monthly range Starter price: $22",
      },
      {
        relativePath: "src/content/guides/stale-range-pricing.md",
        message: "Found noncanonical Kaiplan monthly range Pro price: $38",
      },
    ]);
  });

  it("allows approved Kaiplan pricing and wedding-focused language", () => {
    const result = auditKaiplanContentConsistency([
      makeFile(
        "src/content/guides/pricing.md",
        "Kaiplan starts at $20/mo or $100 lifetime for couples planning one wedding.",
      ),
      makeFile(
        "src/content/guides/table-pricing.md",
        "| Kaiplan Starter ($20/mo x 15 months) | $300 |\n| Kaiplan Pro ($35/mo x 15 months) | $525 |",
      ),
      makeFile(
        "src/content/guides/range-pricing.md",
        "Kaiplan also offers $20/mo and $35/mo plans. It starts at $20-$35/month, or $100 once.",
      ),
      makeFile(
        "src/config/site.ts",
        'ctaText: "Start planning with Kaiplan"\nsubtitle: "Create your account, start the trial, and choose a plan later."',
      ),
      makeFile(
        "dist/resources/index.html",
        "<h2>Wedding planning guide questions</h2>",
      ),
    ]);

    expect(result).toEqual([]);
  });

  it("passes against the public content corpus", () => {
    const files = collectSourceFiles(resolve(webRoot, "src/content"));
    expect(files.length).toBeGreaterThan(0);

    expect(auditKaiplanContentConsistency(files)).toEqual([]);
  });

  it("passes against public source outside markdown content", () => {
    const files = [
      ...collectSourceFiles(resolve(webRoot, "src/config")),
      ...collectSourceFiles(resolve(webRoot, "src/lib")),
      ...collectSourceFiles(resolve(webRoot, "src/pages")),
      ...collectSourceFiles(
        resolve(repoRoot, "packages/knowledge/src"),
        repoRoot,
      ),
    ];
    expect(files.length).toBeGreaterThan(0);

    expect(auditKaiplanContentConsistency(files)).toEqual([]);
  });
});

describe("auditPrivacyConsistency", () => {
  it("returns no issues when all expected processors are mentioned in privacy policy", () => {
    const privacyContent =
      "Stripe — payment processing. Resend — email delivery. Neon — database. Apollo.io — internal CRM. Cloudflare — CDN.";
    const result = auditPrivacyConsistency([
      makeFile("src/pages/privacy.astro", privacyContent),
    ]);

    expect(result).toEqual([]);
  });

  it("reports a missing processor when it is absent from the privacy policy", () => {
    const privacyContent =
      "Stripe — payment processing. Resend — email delivery. Neon — database. Cloudflare — CDN.";
    const result = auditPrivacyConsistency([
      makeFile("src/pages/privacy.astro", privacyContent),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      relativePath: "src/pages/privacy.astro",
      message: "Privacy policy should mention third-party processor: Apollo.io",
    });
  });

  it("reports all missing processors when none are mentioned", () => {
    const result = auditPrivacyConsistency([
      makeFile("src/pages/privacy.astro", "We take privacy seriously."),
    ]);

    expect(result).toHaveLength(5);
    const messages = result.map((i) => i.message);
    expect(messages).toContain(
      "Privacy policy should mention third-party processor: Stripe",
    );
    expect(messages).toContain(
      "Privacy policy should mention third-party processor: Resend",
    );
    expect(messages).toContain(
      "Privacy policy should mention third-party processor: Neon",
    );
    expect(messages).toContain(
      "Privacy policy should mention third-party processor: Apollo.io",
    );
    expect(messages).toContain(
      "Privacy policy should mention third-party processor: Cloudflare",
    );
  });

  it("returns no issues when the files array contains no privacy file", () => {
    const result = auditPrivacyConsistency([
      makeFile("src/pages/index.astro", "Welcome to Kaiplan."),
    ]);

    expect(result).toEqual([]);
  });

  it("all issues reference the privacy file path", () => {
    const result = auditPrivacyConsistency([
      makeFile("src/pages/privacy.astro", "No processors mentioned here."),
    ]);

    for (const issue of result) {
      expect(issue.relativePath).toBe("src/pages/privacy.astro");
    }
  });
});
