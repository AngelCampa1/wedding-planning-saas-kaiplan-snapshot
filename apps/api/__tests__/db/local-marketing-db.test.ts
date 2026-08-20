import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createLocalMarketingDb } from "../../src/db/local-marketing-db";
import {
  emailPreference,
  emailUnsubscribeToken,
} from "../../src/db/marketing-schema";

describe("createLocalMarketingDb", () => {
  it("stores and filters email preferences by Drizzle conditions", async () => {
    const db = createLocalMarketingDb();
    const email = `planner-${crypto.randomUUID()}@example.com`;

    const inserted = await db
      .insert(emailPreference)
      .values([
        {
          id: crypto.randomUUID(),
          email,
          weddingId: null,
          preferenceType: "memberInvite",
          enabled: false,
          updatedAt: "2026-04-29T00:00:00.000Z",
          createdAt: "2026-04-29T00:00:00.000Z",
        },
        {
          id: crypto.randomUUID(),
          email: `other-${crypto.randomUUID()}@example.com`,
          weddingId: null,
          preferenceType: "memberInvite",
          enabled: true,
          updatedAt: "2026-04-29T00:00:00.000Z",
          createdAt: "2026-04-29T00:00:00.000Z",
        },
      ])
      .returning();

    expect(inserted).toHaveLength(2);

    const rows = await db
      .select()
      .from(emailPreference)
      .where(
        and(
          eq(emailPreference.email, email),
          isNull(emailPreference.weddingId),
        ),
      );

    expect(rows).toMatchObject([
      {
        email,
        weddingId: null,
        preferenceType: "memberInvite",
        enabled: false,
        wedding_id: null,
        preference_type: "memberInvite",
      },
    ]);
  });

  it("replaces rows via delete and insert", async () => {
    const db = createLocalMarketingDb();
    const email = `replace-${crypto.randomUUID()}@example.com`;

    await db.insert(emailPreference).values({
      id: crypto.randomUUID(),
      email,
      weddingId: null,
      preferenceType: "rsvpReminder",
      enabled: false,
      updatedAt: "2026-04-29T00:00:00.000Z",
      createdAt: "2026-04-29T00:00:00.000Z",
    });

    const deleted = await db
      .delete(emailPreference)
      .where(
        and(
          eq(emailPreference.email, email),
          isNull(emailPreference.weddingId),
        ),
      )
      .returning();
    expect(deleted).toEqual([]);

    await db.insert(emailPreference).values({
      id: crypto.randomUUID(),
      email,
      weddingId: null,
      preferenceType: "rsvpReminder",
      enabled: true,
      updatedAt: "2026-04-29T00:01:00.000Z",
      createdAt: "2026-04-29T00:01:00.000Z",
    });

    const rows = await db
      .select()
      .from(emailPreference)
      .where(eq(emailPreference.email, email));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ enabled: true });
  });

  it("supports transactional compare-and-swap token updates", async () => {
    const db = createLocalMarketingDb();
    const tokenId = crypto.randomUUID();

    await db.insert(emailUnsubscribeToken).values({
      id: tokenId,
      email: `token-${crypto.randomUUID()}@example.com`,
      weddingId: null,
      allowedTypes: ["memberInvite"],
      expiresAt: "2026-05-29T00:00:00.000Z",
      usedAt: null,
      createdAt: "2026-04-29T00:00:00.000Z",
    });

    const firstClaim = await db.transaction((tx) =>
      tx
        .update(emailUnsubscribeToken)
        .set({ usedAt: "2026-04-29T00:02:00.000Z" })
        .where(
          and(
            eq(emailUnsubscribeToken.id, tokenId),
            isNull(emailUnsubscribeToken.usedAt),
          ),
        )
        .returning(),
    );

    const secondClaim = await db.transaction((tx) =>
      tx
        .update(emailUnsubscribeToken)
        .set({ usedAt: "2026-04-29T00:03:00.000Z" })
        .where(
          and(
            eq(emailUnsubscribeToken.id, tokenId),
            isNull(emailUnsubscribeToken.usedAt),
          ),
        )
        .returning(),
    );

    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]).toMatchObject({
      id: tokenId,
      usedAt: "2026-04-29T00:02:00.000Z",
      used_at: "2026-04-29T00:02:00.000Z",
    });
    expect(secondClaim).toEqual([]);
  });

  it("supports less-than selection and in-array deletion filters", async () => {
    const db = createLocalMarketingDb();
    const expiredTokenId = crypto.randomUUID();
    const activeTokenId = crypto.randomUUID();

    await db.insert(emailUnsubscribeToken).values([
      {
        id: expiredTokenId,
        email: `expired-${crypto.randomUUID()}@example.com`,
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2000-05-29T00:00:00.000Z",
        usedAt: null,
        createdAt: "2000-05-01T00:00:00.000Z",
      },
      {
        id: activeTokenId,
        email: `active-${crypto.randomUUID()}@example.com`,
        weddingId: null,
        allowedTypes: ["memberInvite"],
        expiresAt: "2099-05-29T00:00:00.000Z",
        usedAt: null,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ]);

    const expiredRows = await db
      .select()
      .from(emailUnsubscribeToken)
      .where(lt(emailUnsubscribeToken.expiresAt, "2026-05-29T00:00:00.000Z"));

    expect(expiredRows).toMatchObject([{ id: expiredTokenId }]);

    await db
      .delete(emailUnsubscribeToken)
      .where(inArray(emailUnsubscribeToken.id, [expiredTokenId]));

    await expect(
      db
        .select()
        .from(emailUnsubscribeToken)
        .where(inArray(emailUnsubscribeToken.id, [expiredTokenId])),
    ).resolves.toEqual([]);
    await expect(
      db
        .select()
        .from(emailUnsubscribeToken)
        .where(eq(emailUnsubscribeToken.id, activeTokenId)),
    ).resolves.toMatchObject([{ id: activeTokenId }]);
  });

  it("rolls back local transaction changes when the callback fails", async () => {
    const db = createLocalMarketingDb();
    const tokenId = crypto.randomUUID();

    await db.insert(emailUnsubscribeToken).values({
      id: tokenId,
      email: `rollback-${crypto.randomUUID()}@example.com`,
      weddingId: null,
      allowedTypes: ["memberInvite"],
      expiresAt: "2026-05-29T00:00:00.000Z",
      usedAt: null,
      createdAt: "2026-04-29T00:00:00.000Z",
    });

    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(emailUnsubscribeToken)
          .set({ usedAt: "2026-04-29T00:02:00.000Z" })
          .where(eq(emailUnsubscribeToken.id, tokenId))
          .returning();
        throw new Error("simulate failure after update");
      }),
    ).rejects.toThrow("simulate failure after update");

    const rows = await db
      .select()
      .from(emailUnsubscribeToken)
      .where(eq(emailUnsubscribeToken.id, tokenId));

    expect(rows).toMatchObject([{ id: tokenId, usedAt: null, used_at: null }]);
  });

  it("keeps local transaction changes when the callback succeeds", async () => {
    const db = createLocalMarketingDb();
    const tokenId = crypto.randomUUID();

    await db.insert(emailUnsubscribeToken).values({
      id: tokenId,
      email: `commit-${crypto.randomUUID()}@example.com`,
      weddingId: null,
      allowedTypes: ["memberInvite"],
      expiresAt: "2026-05-29T00:00:00.000Z",
      usedAt: null,
      createdAt: "2026-04-29T00:00:00.000Z",
    });

    await db.transaction((tx) =>
      tx
        .update(emailUnsubscribeToken)
        .set({ usedAt: "2026-04-29T00:02:00.000Z" })
        .where(eq(emailUnsubscribeToken.id, tokenId))
        .returning(),
    );

    const rows = await db
      .select()
      .from(emailUnsubscribeToken)
      .where(eq(emailUnsubscribeToken.id, tokenId));

    expect(rows).toMatchObject([
      { id: tokenId, usedAt: "2026-04-29T00:02:00.000Z" },
    ]);
  });

  it("handles empty tables and non-matching updates", async () => {
    const db = createLocalMarketingDb();
    const missingEmail = `missing-${crypto.randomUUID()}@example.com`;

    const rows = await db
      .select()
      .from(emailPreference)
      .where(eq(emailPreference.email, missingEmail))
      .limit(1);

    const updated = await db
      .update(emailPreference)
      .set({ enabled: false })
      .where(eq(emailPreference.email, missingEmail))
      .returning();

    expect(rows).toEqual([]);
    expect(updated).toEqual([]);
  });

  it("keeps defensive fallback table handling isolated", async () => {
    class Param {
      constructor(
        public encoder: { name: unknown },
        public value: unknown,
      ) {}
    }

    const db = createLocalMarketingDb() as unknown as {
      select(): {
        from(table: unknown): Promise<unknown[]>;
        where(condition: unknown): Promise<unknown[]>;
      };
      insert(table: unknown): {
        values(input: Record<string, unknown>): {
          returning(): Promise<unknown[]>;
        };
      };
      delete(table: unknown): {
        where(condition: unknown): {
          returning(): Promise<unknown[]>;
        };
      };
    };

    expect(await db.select().from(null)).toEqual([]);
    expect(await db.select().from({ [Symbol("drizzle:Name")]: 1 })).toEqual([]);

    const inserted = await db
      .insert({})
      .values({ id: "fallback-row" })
      .returning();

    expect(inserted).toMatchObject([{ id: "fallback-row" }]);
    expect(await db.select().from({})).toMatchObject([{ id: "fallback-row" }]);
    expect(
      await db.select().where({ queryChunks: [{ name: "email" }] }),
    ).toMatchObject([{ id: "fallback-row" }]);
    expect(
      await db.select().where(new Param({ name: 1 }, "unfilterable-value")),
    ).toMatchObject([{ id: "fallback-row" }]);
    expect(
      await db
        .select()
        .where({ nested: [new Param({ name: "id" }, "fallback-row")] }),
    ).toMatchObject([{ id: "fallback-row" }]);
    expect(
      await db.select().where({ queryChunks: [{ name: 1 }] }),
    ).toMatchObject([{ id: "fallback-row" }]);
    expect(
      await db.select().where({
        queryChunks: [
          "",
          { name: "id" },
          { value: [" = "] },
          { constructor: { name: "NotParam" }, value: "fallback-row" },
        ],
      }),
    ).toMatchObject([{ id: "fallback-row" }]);
    expect(
      await db.select().where({
        queryChunks: ["", { name: "id" }, { value: [" in "] }, "fallback-row"],
      }),
    ).toMatchObject([{ id: "fallback-row" }]);

    expect(await db.delete({}).where(null).returning()).toEqual([]);
    expect(await db.select().from({})).toEqual([]);
    expect(await db.delete(null).where(null).returning()).toEqual([]);
    expect(
      await db
        .update(null)
        .set({ id: "missing-row" })
        .where(new Param({ name: "id" }, "missing-row"))
        .returning(),
    ).toEqual([]);
  });
});
