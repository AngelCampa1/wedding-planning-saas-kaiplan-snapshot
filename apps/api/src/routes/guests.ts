import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { eq, and, isNull, inArray, sql, type SQL } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import {
  createGuestSchema,
  updateGuestSchema,
  bulkUpdateRsvpSchema,
} from "@kaiplan/shared";
import { RSVP_STATUSES, DIETARY_TAGS, GUEST_SIDES } from "@kaiplan/shared";
import type { RsvpStatus, DietaryTag, GuestSide } from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import { guest } from "../db/guest-schema";
import { householdRsvpToken } from "../db/wedding-website-schema";
import {
  removeGuestFromSeatingChart,
  removeGuestsFromSeatingChart,
} from "../lib/seating-cleanup";
import { readJsonBody, readJsonObjectBody } from "../lib/json-body";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";
import { parseCsvGuests } from "./guest-csv-import";

// Minimal tx type accepted by seating helpers — matches what Drizzle gives us
// inside db.transaction callbacks without depending on a fully-constructed Database.
type TxClient = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "execute"
>;

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

type AppEnv = { Bindings: Env; Variables: Variables };

type GuestRow = InferSelectModel<typeof guest>;

interface GuestWithPlusOnes extends GuestRow {
  plusOnes: GuestRow[];
}

class GuestBulkRsvpConflictError extends Error {
  constructor() {
    super("GUEST_BULK_RSVP_CONFLICT");
  }
}

class GuestDeleteNotFoundError extends Error {
  constructor() {
    super("GUEST_DELETE_NOT_FOUND");
  }
}

class PrimaryGuestHasPlusOnesError extends Error {
  constructor() {
    super("PRIMARY_GUEST_HAS_PLUS_ONES");
  }
}

class PrimaryGuestChangedError extends Error {
  constructor() {
    super("PRIMARY_GUEST_CHANGED");
  }
}

function isGuestNameConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? error.code : null;
  const constraint = "constraint" in error ? error.constraint : null;
  if (
    code === "23505" &&
    (constraint === "guest_primary_name_unique" ||
      constraint === "guest_plusone_name_unique")
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("guest_primary_name_unique") ||
    message.includes("guest_plusone_name_unique")
  ) {
    return true;
  }

  return "cause" in error && isGuestNameConflictError(error.cause);
}

function guestNameConflictResponse(c: Context<AppEnv>, error: unknown) {
  if (isGuestNameConflictError(error)) {
    return c.json(
      { error: "A guest with this name already exists in this household." },
      409,
    );
  }

  throw error;
}

function requireWriter(c: Context<AppEnv>) {
  if (c.get("weddingRole") === "viewer") {
    return c.json({ error: "Viewers cannot modify guests" }, 403);
  }
  return null;
}

async function deleteScopedGuest(
  tx: TxClient,
  weddingId: string,
  guestId: string,
): Promise<void> {
  const [deletedGuest] = (await tx
    .delete(guest)
    .where(and(eq(guest.id, guestId), eq(guest.weddingId, weddingId)))
    .returning({ id: guest.id })) as Array<{ id: string }>;

  if (!deletedGuest) {
    throw new GuestDeleteNotFoundError();
  }
}

async function lockGuestRow(
  tx: TxClient,
  weddingId: string,
  guestId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT id FROM guest WHERE id = ${guestId} AND wedding_id = ${weddingId} FOR UPDATE`,
  );
}

function guestDeleteNotFoundResponse(c: Context<AppEnv>, error: unknown) {
  if (error instanceof GuestDeleteNotFoundError) {
    return c.json({ error: "Guest not found" }, 404);
  }
  if (error instanceof PrimaryGuestHasPlusOnesError) {
    return c.json(
      { error: "Primary guests with plus-ones require household deletion" },
      409,
    );
  }
  throw error;
}

function primaryGuestChangedResponse(c: Context<AppEnv>, error: unknown) {
  if (error instanceof PrimaryGuestChangedError) {
    return c.json({ error: "Primary guest changed before write" }, 409);
  }

  return guestNameConflictResponse(c, error);
}

function nestPlusOnes(rows: GuestRow[]): GuestWithPlusOnes[] {
  const primaries: GuestWithPlusOnes[] = [];
  const plusOnesMap = new Map<string, GuestRow[]>();

  for (const row of rows) {
    if (row.primaryGuestId === null) {
      primaries.push({ ...row, plusOnes: [] });
    } else {
      const existing = plusOnesMap.get(row.primaryGuestId) ?? [];
      existing.push(row);
      plusOnesMap.set(row.primaryGuestId, existing);
    }
  }

  for (const primary of primaries) {
    primary.plusOnes = plusOnesMap.get(primary.id) ?? [];
  }

  return primaries;
}

function computeSummary(rows: GuestRow[]) {
  const byRsvp = Object.fromEntries(RSVP_STATUSES.map((s) => [s, 0])) as Record<
    RsvpStatus,
    number
  >;
  const byDietary = Object.fromEntries(
    DIETARY_TAGS.map((t) => [t, 0]),
  ) as Record<DietaryTag, number>;
  const bySide = Object.fromEntries(GUEST_SIDES.map((s) => [s, 0])) as Record<
    GuestSide,
    number
  >;

  let totalPlusOnes = 0;

  for (const row of rows) {
    const rsvpKey = row.rsvpStatus as RsvpStatus;
    if (rsvpKey in byRsvp) byRsvp[rsvpKey]++;
    const sideKey = row.side as GuestSide;
    if (sideKey in bySide) bySide[sideKey]++;
    for (const tag of row.dietaryTags) {
      const tagKey = tag as DietaryTag;
      if (tagKey in byDietary) byDietary[tagKey]++;
    }
    if (row.primaryGuestId !== null) {
      totalPlusOnes++;
    }
  }

  const totalGuests = rows.length;
  const totalPrimary = totalGuests - totalPlusOnes;

  return {
    totalGuests,
    totalPrimary,
    totalPlusOnes,
    byRsvp,
    byDietary,
    bySide,
  };
}

export function guestRoutes(db: Database, auth: Auth) {
  const app = new Hono<AppEnv>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  // -------------------------------------------------------------------------
  // List all guests (nested plus-ones)
  // -------------------------------------------------------------------------
  app.get(
    "/:weddingId/guests",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const conditions: SQL[] = [eq(guest.weddingId, weddingId)];

      const side = c.req.query("side");
      if (side) {
        const parsedSide = z.enum(GUEST_SIDES).safeParse(side);
        if (!parsedSide.success) {
          return c.json({ error: "Invalid side value" }, 400);
        }
        conditions.push(eq(guest.side, parsedSide.data));
      }

      const rsvpStatus = c.req.query("rsvpStatus");
      if (rsvpStatus) {
        const parsedRsvp = z.enum(RSVP_STATUSES).safeParse(rsvpStatus);
        if (!parsedRsvp.success) {
          return c.json({ error: "Invalid rsvpStatus value" }, 400);
        }
        conditions.push(eq(guest.rsvpStatus, parsedRsvp.data));
      }

      const groupName = c.req.query("groupName");
      if (groupName) conditions.push(eq(guest.groupName, groupName));

      const rows = (await db
        .select()
        .from(guest)
        .where(and(...conditions))
        .orderBy(guest.sortOrder, guest.createdAt, guest.id)) as GuestRow[];

      return c.json(nestPlusOnes(rows));
    },
  );

  // -------------------------------------------------------------------------
  // Guest summary
  // -------------------------------------------------------------------------
  app.get(
    "/:weddingId/guests/summary",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");

      const rows = (await db
        .select()
        .from(guest)
        .where(eq(guest.weddingId, weddingId))) as GuestRow[];

      return c.json(computeSummary(rows));
    },
  );

  // -------------------------------------------------------------------------
  // Bulk RSVP update
  // -------------------------------------------------------------------------
  app.patch(
    "/:weddingId/guests/bulk-rsvp",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonBody(c);
      if (response) return response;

      const parsed = bulkUpdateRsvpSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const ids = parsed.data.map((item) => item.id);

      // Verify all IDs belong to this wedding
      const found = (await db
        .select({ id: guest.id })
        .from(guest)
        .where(
          and(eq(guest.weddingId, weddingId), inArray(guest.id, ids)),
        )) as { id: string }[];

      if (found.length !== ids.length) {
        return c.json(
          { error: "Some guest IDs do not belong to this wedding" },
          400,
        );
      }

      // M12: Batch RSVP updates — group items by status and issue one UPDATE
      // per distinct status value instead of one per guest row (N+1 fix).
      const byStatus = new Map<string, string[]>();
      for (const item of parsed.data) {
        const group = byStatus.get(item.rsvpStatus) ?? [];
        group.push(item.id);
        byStatus.set(item.rsvpStatus, group);
      }
      const declinedIds = byStatus.get("declined") ?? [];

      let updated: number;
      try {
        updated = await db.transaction(async (tx) => {
          let updatedInTx = 0;
          for (const [rsvpStatus, statusIds] of byStatus) {
            const rows = (await tx
              .update(guest)
              .set({ rsvpStatus, updatedAt: new Date() })
              .where(
                and(
                  eq(guest.weddingId, weddingId),
                  inArray(guest.id, statusIds),
                ),
              )
              .returning({ id: guest.id })) as Array<{ id: string }>;
            if (rows.length !== statusIds.length) {
              throw new GuestBulkRsvpConflictError();
            }
            updatedInTx += rows.length;
          }
          await removeGuestsFromSeatingChart(tx, weddingId, declinedIds);
          return updatedInTx;
        });
      } catch (error) {
        if (!(error instanceof GuestBulkRsvpConflictError)) {
          throw error;
        }
        return c.json(
          { error: "One or more guest RSVPs could not be updated." },
          409,
        );
      }

      return c.json({ updated });
    },
  );

  // -------------------------------------------------------------------------
  // Get single guest
  // -------------------------------------------------------------------------
  app.get(
    "/:weddingId/guests/:guestId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");
      const guestId = c.req.param("guestId");

      const rows = (await db
        .select()
        .from(guest)
        .where(
          and(eq(guest.id, guestId), eq(guest.weddingId, weddingId)),
        )) as GuestRow[];

      if (rows.length === 0) {
        return c.json({ error: "Guest not found" }, 404);
      }

      const guestRow = rows[0];

      // Fetch plus-ones for this guest
      const plusOnes = (await db
        .select()
        .from(guest)
        .where(
          and(
            eq(guest.primaryGuestId, guestId),
            eq(guest.weddingId, weddingId),
          ),
        )) as GuestRow[];

      return c.json({ ...guestRow, plusOnes });
    },
  );

  // -------------------------------------------------------------------------
  // Create guest
  // -------------------------------------------------------------------------
  app.post(
    "/:weddingId/guests",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = createGuestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      let created: GuestRow | undefined;
      try {
        const values = {
          weddingId,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          side: parsed.data.side,
          groupName: parsed.data.groupName ?? null,
          dietaryTags: parsed.data.dietaryTags,
          dietaryNotes: parsed.data.dietaryNotes ?? null,
          rsvpStatus: parsed.data.rsvpStatus,
          primaryGuestId: parsed.data.primaryGuestId ?? null,
        };

        const rows = parsed.data.primaryGuestId
          ? ((await db.transaction(async (tx) => {
              const [primaryGuest] = (await tx
                .select({ id: guest.id })
                .from(guest)
                .where(
                  and(
                    eq(guest.id, parsed.data.primaryGuestId!),
                    eq(guest.weddingId, weddingId),
                    isNull(guest.primaryGuestId),
                  ),
                )
                .limit(1)) as { id: string }[];

              if (!primaryGuest) {
                return [];
              }

              return tx.insert(guest).values(values).returning();
            })) as GuestRow[])
          : ((await db.insert(guest).values(values).returning()) as GuestRow[]);
        created = rows[0];
      } catch (error) {
        return guestNameConflictResponse(c, error);
      }

      if (!created) {
        return c.json({ error: "Guest not found" }, 404);
      }

      return c.json(created, 201);
    },
  );

  // -------------------------------------------------------------------------
  // Update guest
  // -------------------------------------------------------------------------
  app.patch(
    "/:weddingId/guests/:guestId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const guestId = c.req.param("guestId");
      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = updateGuestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const [existingGuest] = (await db
        .select({
          id: guest.id,
          primaryGuestId: guest.primaryGuestId,
        })
        .from(guest)
        .where(and(eq(guest.id, guestId), eq(guest.weddingId, weddingId)))
        .limit(1)) as { id: string; primaryGuestId: string | null }[];

      if (!existingGuest) {
        return c.json({ error: "Guest not found" }, 404);
      }

      const hasPrimaryGuestId = Object.prototype.hasOwnProperty.call(
        parsed.data,
        "primaryGuestId",
      );
      const nextPrimaryGuestId = hasPrimaryGuestId
        ? (parsed.data.primaryGuestId ?? null)
        : existingGuest.primaryGuestId;

      if (
        existingGuest.primaryGuestId !== null &&
        hasPrimaryGuestId &&
        parsed.data.primaryGuestId === null
      ) {
        return c.json({ error: "Plus-one linkage cannot be removed" }, 400);
      }

      if (nextPrimaryGuestId !== null) {
        if (nextPrimaryGuestId === guestId) {
          return c.json(
            { error: "Guest cannot be their own primary guest" },
            400,
          );
        }

        if (existingGuest.primaryGuestId === null) {
          return c.json({ error: "Primary guests cannot be reparented" }, 400);
        }

        const [primaryGuest] = (await db
          .select({ id: guest.id, primaryGuestId: guest.primaryGuestId })
          .from(guest)
          .where(
            and(
              eq(guest.id, nextPrimaryGuestId),
              eq(guest.weddingId, weddingId),
              isNull(guest.primaryGuestId),
            ),
          )
          .limit(1)) as { id: string; primaryGuestId: string | null }[];

        if (!primaryGuest) {
          return c.json({ error: "Primary guest not found" }, 404);
        }
      }

      let result: GuestRow[];
      try {
        result = (await db.transaction(async (tx) => {
          if (nextPrimaryGuestId !== null) {
            const [primaryGuest] = (await tx
              .select({ id: guest.id })
              .from(guest)
              .where(
                and(
                  eq(guest.id, nextPrimaryGuestId),
                  eq(guest.weddingId, weddingId),
                  isNull(guest.primaryGuestId),
                ),
              )
              .limit(1)) as { id: string }[];

            if (!primaryGuest) {
              throw new PrimaryGuestChangedError();
            }
          }

          const rows = (await tx
            .update(guest)
            .set({
              ...parsed.data,
              primaryGuestId: nextPrimaryGuestId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(guest.id, guestId),
                eq(guest.weddingId, weddingId),
                existingGuest.primaryGuestId === null
                  ? isNull(guest.primaryGuestId)
                  : eq(guest.primaryGuestId, existingGuest.primaryGuestId),
              ),
            )
            .returning()) as GuestRow[];

          if (parsed.data.rsvpStatus === "declined" && rows.length > 0) {
            await removeGuestFromSeatingChart(tx, weddingId, guestId);
          }

          return rows;
        })) as GuestRow[];
      } catch (error) {
        return primaryGuestChangedResponse(c, error);
      }

      if (result.length === 0 && existingGuest.primaryGuestId !== null) {
        return c.json({ error: "Primary guest changed before write" }, 409);
      }

      if (result.length === 0) {
        return c.json({ error: "Guest not found" }, 404);
      }

      return c.json(result[0]);
    },
  );

  // -------------------------------------------------------------------------
  // Delete guest
  // -------------------------------------------------------------------------
  app.delete(
    "/:weddingId/guests/:guestId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const guestId = c.req.param("guestId");
      const [existingGuest] = (await db
        .select()
        .from(guest)
        .where(and(eq(guest.id, guestId), eq(guest.weddingId, weddingId)))
        .limit(1)) as GuestRow[];

      if (!existingGuest) {
        return c.json({ error: "Guest not found" }, 404);
      }

      const plusOnes = (await db
        .select({ id: guest.id })
        .from(guest)
        .where(
          and(
            eq(guest.primaryGuestId, guestId),
            eq(guest.weddingId, weddingId),
          ),
        )) as Array<{ id: string }>;

      if (plusOnes.length > 0) {
        return c.json(
          { error: "Primary guests with plus-ones require household deletion" },
          409,
        );
      }

      try {
        if (existingGuest.primaryGuestId === null) {
          await db.transaction(async (tx) => {
            await lockGuestRow(tx, weddingId, guestId);
            const plusOnesInTx = (await tx
              .select({ id: guest.id })
              .from(guest)
              .where(
                and(
                  eq(guest.primaryGuestId, guestId),
                  eq(guest.weddingId, weddingId),
                ),
              )) as Array<{ id: string }>;

            if (plusOnesInTx.length > 0) {
              throw new PrimaryGuestHasPlusOnesError();
            }

            await tx
              .delete(householdRsvpToken)
              .where(
                and(
                  eq(householdRsvpToken.weddingId, weddingId),
                  eq(householdRsvpToken.primaryGuestId, guestId),
                ),
              );

            await removeGuestFromSeatingChart(tx, weddingId, guestId);
            await deleteScopedGuest(tx, weddingId, guestId);
          });
        } else {
          await db.transaction(async (tx) => {
            await removeGuestFromSeatingChart(tx, weddingId, guestId);
            await deleteScopedGuest(tx, weddingId, guestId);
          });
        }
      } catch (error) {
        return guestDeleteNotFoundResponse(c, error);
      }

      return c.body(null, 204);
    },
  );

  app.delete(
    "/:weddingId/guests/:guestId/household",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");
      const guestId = c.req.param("guestId");

      const [existingGuest] = (await db
        .select()
        .from(guest)
        .where(and(eq(guest.id, guestId), eq(guest.weddingId, weddingId)))
        .limit(1)) as GuestRow[];

      if (!existingGuest) {
        return c.json({ error: "Guest not found" }, 404);
      }

      if (existingGuest.primaryGuestId !== null) {
        try {
          await db.transaction(async (tx) => {
            await removeGuestFromSeatingChart(tx, weddingId, guestId);
            await deleteScopedGuest(tx, weddingId, guestId);
          });
        } catch (error) {
          return guestDeleteNotFoundResponse(c, error);
        }
        return c.body(null, 204);
      }

      try {
        await db.transaction(async (tx) => {
          await lockGuestRow(tx, weddingId, guestId);
          await tx
            .delete(householdRsvpToken)
            .where(
              and(
                eq(householdRsvpToken.weddingId, weddingId),
                eq(householdRsvpToken.primaryGuestId, guestId),
              ),
            );

          const deletedPlusOnes = (await tx
            .delete(guest)
            .where(
              and(
                eq(guest.weddingId, weddingId),
                eq(guest.primaryGuestId, guestId),
              ),
            )
            .returning({ id: guest.id })) as Array<{ id: string }>;

          await removeGuestsFromSeatingChart(tx, weddingId, [
            guestId,
            ...deletedPlusOnes.map((plusOne) => plusOne.id),
          ]);

          await deleteScopedGuest(tx, weddingId, guestId);
        });
      } catch (error) {
        return guestDeleteNotFoundResponse(c, error);
      }

      return c.body(null, 204);
    },
  );

  // -------------------------------------------------------------------------
  // CSV import
  // -------------------------------------------------------------------------
  app.post(
    "/:weddingId/guests/import-csv",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const weddingId = c.req.param("weddingId");

      // Accept multipart/form-data (file upload) or raw text body
      let csvText: string;
      const contentType = c.req.header("content-type") ?? "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await c.req.formData();
        const file = formData.get("file");
        if (!file || typeof file === "string") {
          return c.json({ error: "No file provided in form data" }, 400);
        }
        const fileObj = file as File;
        if (fileObj.size > 5 * 1024 * 1024) {
          return c.json({ error: "File exceeds 5MB limit" }, 400);
        }
        csvText = await fileObj.text();
      } else {
        const rawBody = await c.req.text();
        if (rawBody.length > 5 * 1024 * 1024) {
          return c.json({ error: "Body exceeds 5MB limit" }, 400);
        }
        csvText = rawBody;
      }

      const { rows, errors } = parseCsvGuests(csvText);

      if (rows.length === 0) {
        return c.json(
          {
            imported: 0,
            errors: errors.map((e) => ({ row: e.row, reason: e.message })),
          },
          400,
        );
      }

      const importErrors: Array<{ row: number; reason: string }> = errors.map(
        (e) => ({ row: e.row, reason: e.message }),
      );
      let imported = 0;

      for (let i = 0; i < rows.length; i++) {
        // Loop bound guarantees rows[i] exists.
        const row = rows[i]!;
        const rowNumber = row.rowNumber;

        const dietaryTags = (row.dietary_tags
          ? row.dietary_tags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          : []) as DietaryTag[];

        const values = {
          weddingId,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email ?? null,
          phone: row.phone ?? null,
          side: (row.side ?? "mutual") as GuestSide,
          groupName: row.group_name ?? null,
          dietaryTags,
          dietaryNotes: row.dietary_notes ?? null,
          rsvpStatus: "pending" as const,
          primaryGuestId: null,
        };

        try {
          await db.insert(guest).values(values);
          imported++;
        } catch (err) {
          const reason =
            err instanceof Error ? err.message : "Unknown insert error";
          importErrors.push({ row: rowNumber, reason });
        }
      }

      return c.json({ imported, errors: importErrors }, 201);
    },
  );

  return app;
}
