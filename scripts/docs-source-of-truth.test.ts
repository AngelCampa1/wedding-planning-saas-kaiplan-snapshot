import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAN_PRICING,
  STRIPE_PRICE_ENV_KEYS,
  TRIAL_DURATION_DAYS,
} from "../packages/shared/src/index";

function readRepoFile(path: string) {
  return readFileSync(path, "utf8");
}

function centsToUsd(cents: number) {
  return cents / 100;
}

const stripePriceEnvKeys = Object.values(STRIPE_PRICE_ENV_KEYS).flatMap(
  (keys) => Object.values(keys),
);

const historicalPricingDocs = [
  "docs/roadmap.md",
  "docs/design-docs/plans/2026-04-07-auth-dashboard-shell.md",
];

describe("docs source of truth", () => {
  it("keeps the offering and pricing doc aligned with shared plan pricing", () => {
    const doc = readRepoFile("docs/pricing.md");
    const starter = PLAN_PRICING.starter;
    const pro = PLAN_PRICING.pro;
    const lifetime = PLAN_PRICING.lifetime;

    expect(doc).toContain(
      `| ${starter.name} | ${starter.price} or ${starter.annualPrice}`,
    );
    expect(doc).toContain(`| ${pro.name} | ${pro.price} or ${pro.annualPrice}`);
    expect(doc).toContain(`| ${lifetime.name} | ${lifetime.price}`);

    expect(doc).toContain(
      `12 months of ${starter.name}: $${
        centsToUsd(starter.monthlyPriceCents) * 12
      } monthly or $${centsToUsd(starter.annualPriceCents)} annual.`,
    );
    expect(doc).toContain(
      `14 months of ${starter.name}: $${
        centsToUsd(starter.monthlyPriceCents) * 14
      } monthly.`,
    );
    expect(doc).toContain(
      `18 months of ${starter.name}: $${
        centsToUsd(starter.monthlyPriceCents) * 18
      } monthly.`,
    );
    expect(doc).toContain(
      `12 months of ${pro.name}: $${
        centsToUsd(pro.monthlyPriceCents) * 12
      } monthly or $${centsToUsd(pro.annualPriceCents)} annual.`,
    );
    expect(doc).toContain(
      `14 months of ${pro.name}: $${
        centsToUsd(pro.monthlyPriceCents) * 14
      } monthly.`,
    );
    expect(doc).toContain(
      `18 months of ${pro.name}: $${
        centsToUsd(pro.monthlyPriceCents) * 18
      } monthly.`,
    );
  });

  it("keeps production Stripe setup docs aligned with shared price env keys", () => {
    const doc = readRepoFile("docs/production-env-vars-step-by-step.md");

    expect(doc).toContain(
      `| ${PLAN_PRICING.starter.name}  | Monthly recurring, USD ${centsToUsd(
        PLAN_PRICING.starter.monthlyPriceCents,
      )} | \`${STRIPE_PRICE_ENV_KEYS.starter.month}\``,
    );
    expect(doc).toContain(
      `| ${PLAN_PRICING.starter.name}  | Annual recurring, USD ${centsToUsd(
        PLAN_PRICING.starter.annualPriceCents,
      )} | \`${STRIPE_PRICE_ENV_KEYS.starter.year}\``,
    );
    expect(doc).toContain(
      `| ${PLAN_PRICING.pro.name}      | Monthly recurring, USD ${centsToUsd(
        PLAN_PRICING.pro.monthlyPriceCents,
      )} | \`${STRIPE_PRICE_ENV_KEYS.pro.month}\``,
    );
    expect(doc).toContain(
      `| ${PLAN_PRICING.pro.name}      | Annual recurring, USD ${centsToUsd(
        PLAN_PRICING.pro.annualPriceCents,
      )} | \`${STRIPE_PRICE_ENV_KEYS.pro.year}\``,
    );
    expect(doc).toContain(
      `| ${PLAN_PRICING.lifetime.name} | One-time, USD ${centsToUsd(
        PLAN_PRICING.lifetime.oneTimePriceCents,
      )}         | \`${STRIPE_PRICE_ENV_KEYS.lifetime.month}\``,
    );

    for (const priceEnvKey of stripePriceEnvKeys) {
      expect(doc).toContain(`wrangler secret put ${priceEnvKey}`);
    }
  });

  it("keeps production readiness docs aligned with shared Stripe price env keys", () => {
    const doc = readRepoFile("docs/production-readiness.md");

    for (const priceEnvKey of stripePriceEnvKeys) {
      expect(doc).toContain(priceEnvKey);
    }
  });

  it("keeps published docs aligned with the shared trial length", () => {
    const trialCopy = `${TRIAL_DURATION_DAYS}-day trial`;
    const docs = readdirSync("docs")
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => `docs/${entry}`);

    // No published doc may quote a stale trial length.
    for (const docPath of docs) {
      const doc = readRepoFile(docPath);
      expect(doc).not.toContain("14-day trial");
      expect(doc).not.toContain("14 day trial");
    }

    // The readiness checklist must state the current one.
    expect(readRepoFile("docs/production-readiness.md")).toContain(trialCopy);
  });

  it("marks historical pricing docs as non-authoritative", () => {
    for (const docPath of historicalPricingDocs) {
      const doc = readRepoFile(docPath);
      expect(doc).toContain("Historical planning artifact");
      expect(doc).toContain("packages/shared");
      expect(doc).toContain("current source of truth for commercial terms");
    }
  });
});
