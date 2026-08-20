import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkStripeCustomerDuplicates,
  ensureStripeCustomerUniqueIndex,
} from "../../scripts/check-stripe-customer-duplicates";

describe("Stripe customer duplicate preflight", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("skips safely before the subscription stripe customer column exists", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{ table_exists: false, column_exists: false }],
      }),
    };

    const canCreateIndex = await checkStripeCustomerDuplicates(pool);

    expect(pool.query).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      "Skipping Stripe customer duplicate preflight because subscription.stripe_customer_id does not exist yet.",
    );
    expect(process.exitCode).toBeUndefined();
    expect(canCreateIndex).toBe(false);
  });

  it("fails the preflight when duplicate Stripe customer ids exist", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ table_exists: true, column_exists: true }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              stripe_customer_id: "cus_1234567890abcdef",
              duplicate_count: "2",
            },
          ],
        }),
    };

    const canCreateIndex = await checkStripeCustomerDuplicates(pool);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      "Duplicate subscription.stripe_customer_id values must be resolved before applying the unique index migration.",
    );
    expect(errorSpy).toHaveBeenCalledWith("- cus_...cdef appears 2 times");
    expect(process.exitCode).toBe(1);
    expect(canCreateIndex).toBe(false);
  });

  it("passes when all Stripe customer ids are unique", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ table_exists: true, column_exists: true }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const canCreateIndex = await checkStripeCustomerDuplicates(pool);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
    expect(canCreateIndex).toBe(true);
  });

  it("creates the Stripe customer unique index concurrently", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ index_exists: false, index_is_valid: null }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await ensureStripeCustomerUniqueIndex(pool);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS"),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("subscription_stripe_customer_id_unique"),
    );
  });

  it("drops invalid concurrent index artifacts before recreating the index", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ index_exists: true, index_is_valid: false }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await ensureStripeCustomerUniqueIndex(pool);

    expect(warnSpy).toHaveBeenCalledWith(
      "Dropping invalid subscription_stripe_customer_id_unique index before recreating it concurrently.",
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("DROP INDEX CONCURRENTLY IF EXISTS"),
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS"),
    );
  });
});
