import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  createWeddingSchema,
  updateWeddingSchema,
  inviteMemberSchema,
} from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import { wedding, weddingMember, subscription } from "../db/schema";
import { vendor } from "../db/vendor-schema";
import { user as userTable } from "../db/auth-schema";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";
import {
  getEffectiveBillingPlan,
  isBillingGateRequired,
  loadSubscription,
  getWeddingOwnerSubscription,
  recordFeatureFirstUse,
  subscriptionHasFeatureAccess,
} from "../lib/billing";
import { recordAuditEvent } from "../lib/audit-log";
import {
  createNoopEmailService,
  verifyMemberInviteToken,
  type EmailService,
} from "../lib/email";
import {
  readJsonObjectBody,
  readOptionalJsonObjectBody,
} from "../lib/json-body";
import type { InviteMemberDeliveryMetadata } from "@kaiplan/shared";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

export function weddingRoutes(
  db: Database,
  auth: Auth,
  emailService: EmailService = createNoopEmailService(),
) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  function buildInviteDeliveryFailure(_error: unknown) {
    return {
      emailId: null,
      provider: "resend" as const,
      status: "failed" as const,
      sentAt: null,
      templateKey: "member-invite",
      skipped: false,
      rateLimited: false,
      error: "Email delivery failed.",
    };
  }

  function summarizeCaughtError(error: unknown) {
    return { error: String(error) };
  }
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  // List user's weddings
  app.get("/", requireSession, async (c) => {
    const user = c.get("user");
    const currentSubscription = await loadSubscription(db, user.id);

    const rows = await db
      .select({
        id: wedding.id,
        name: wedding.name,
        date: wedding.date,
        budgetCents: wedding.budgetCents,
        currency: wedding.currency,
        timezone: wedding.timezone,
        createdBy: wedding.createdBy,
        archivedAt: wedding.archivedAt,
        status: wedding.status,
        createdAt: wedding.createdAt,
        updatedAt: wedding.updatedAt,
        role: weddingMember.role,
      })
      .from(weddingMember)
      .innerJoin(wedding, eq(weddingMember.weddingId, wedding.id))
      .where(eq(weddingMember.userId, user.id));

    if (
      isBillingGateRequired(currentSubscription) &&
      rows.some((row) => row.role === "owner" && row.status !== "archived")
    ) {
      return c.json(
        {
          error: "Complete billing setup to continue.",
          plan: currentSubscription?.plan ?? "free",
          status: currentSubscription?.status ?? "inactive",
          effectivePlan: getEffectiveBillingPlan(currentSubscription),
          billingGateRequired: true,
        },
        402,
      );
    }

    return c.json(rows);
  });

  // Create a wedding
  app.post("/", requireSession, async (c) => {
    const user = c.get("user");
    const currentSubscription = await loadSubscription(db, user.id);
    const { body, response } = await readJsonObjectBody(c);
    if (response) return response;

    const parsed = createWeddingSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    if (isBillingGateRequired(currentSubscription)) {
      return c.json(
        {
          error: "Complete billing setup to continue.",
          plan: currentSubscription!.plan,
          status: currentSubscription!.status,
          effectivePlan: getEffectiveBillingPlan(currentSubscription),
          billingGateRequired: true,
        },
        402,
      );
    }

    const now = new Date();
    const [newWedding] = await db.transaction(async (tx) => {
      const createdRows = await tx
        .insert(wedding)
        .values({
          name: parsed.data.name,
          date: parsed.data.date,
          budgetCents: parsed.data.budgetCents,
          currency: parsed.data.currency,
          timezone: parsed.data.timezone,
          createdBy: user.id,
        })
        .returning();
      // insert().returning() always returns the inserted row.
      const created = createdRows[0]!;

      await tx.insert(weddingMember).values({
        weddingId: created.id,
        userId: user.id,
        role: "owner",
        acceptedAt: new Date(),
      });

      // Seed the free-trial clock on first wedding creation in the same
      // transaction as the wedding/member rows, so a failed upsert cannot
      // leave a committed wedding without billing-trial state.
      await tx
        .insert(subscription)
        .values({
          userId: user.id,
          plan: "free",
          status: "trialing",
          trialStartedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: subscription.userId,
          set: { trialStartedAt: now, status: "trialing", updatedAt: now },
          setWhere: and(
            isNull(subscription.trialStartedAt),
            eq(subscription.plan, "free"),
            eq(subscription.status, "inactive"),
          ),
        });

      return [created];
    });

    return c.json(newWedding, 201);
  });

  // Get wedding details
  app.get("/:weddingId", requireSession, requireWeddingAccess, async (c) => {
    const weddingId = c.req.param("weddingId");

    const [row] = await db
      .select()
      .from(wedding)
      .where(eq(wedding.id, weddingId))
      .limit(1);

    if (!row) {
      return c.json({ error: "Wedding not found" }, 404);
    }

    return c.json(row);
  });

  // Update wedding
  app.patch("/:weddingId", requireSession, requireWeddingAccess, async (c) => {
    const weddingId = c.req.param("weddingId");
    const role = c.get("weddingRole");

    if (role === "viewer") {
      return c.json({ error: "Viewers cannot edit weddings" }, 403);
    }

    const { body, response } = await readJsonObjectBody(c);
    if (response) return response;

    const parsed = updateWeddingSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [updated] = await db
      .update(wedding)
      .set({
        name: parsed.data.name,
        date: parsed.data.date,
        budgetCents: parsed.data.budgetCents,
        currency: parsed.data.currency,
        timezone: parsed.data.timezone,
        updatedAt: new Date(),
      })
      .where(eq(wedding.id, weddingId))
      .returning();

    if (!updated) {
      return c.json({ error: "Wedding not found" }, 404);
    }

    return c.json(updated);
  });

  // Delete a wedding (owner only) — cascade deletes are handled by the DB
  // schema (`onDelete: "cascade"` on every FK referencing wedding.id).
  //
  // Note: we intentionally check membership inline here rather than using
  // `requireWeddingAccess`, because that middleware blocks writes against
  // archived weddings (423). Archived weddings still need to be deletable
  // for GDPR/right-to-delete compliance (audit finding #17).
  app.delete("/:weddingId", requireSession, async (c) => {
    const weddingId = c.req.param("weddingId");
    const user = c.get("user");

    const membership = await db
      .select({ role: weddingMember.role })
      .from(weddingMember)
      .where(
        and(
          eq(weddingMember.weddingId, weddingId),
          eq(weddingMember.userId, user.id),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!membership) {
      return c.json({ error: "Not a member of this wedding" }, 403);
    }

    if (membership.role !== "owner") {
      return c.json({ error: "Only owners can delete this wedding" }, 403);
    }

    const deleted = await db.transaction(async (tx) => {
      await tx.delete(vendor).where(
        and(
          eq(vendor.weddingId, weddingId),
          sql`EXISTS (
            SELECT 1 FROM ${weddingMember}
            WHERE ${weddingMember.weddingId} = ${weddingId}
              AND ${weddingMember.userId} = ${user.id}
              AND ${weddingMember.role} = 'owner'
          )`,
        ),
      );

      return tx
        .delete(wedding)
        .where(
          and(
            eq(wedding.id, weddingId),
            sql`EXISTS (
              SELECT 1 FROM ${weddingMember}
              WHERE ${weddingMember.weddingId} = ${wedding.id}
                AND ${weddingMember.userId} = ${user.id}
                AND ${weddingMember.role} = 'owner'
            )`,
          ),
        )
        .returning({ id: wedding.id });
    });

    if (deleted.length === 0) {
      return c.json({ error: "Only owners can delete this wedding" }, 403);
    }

    return c.body(null, 204);
  });

  // List members
  app.get(
    "/:weddingId/members",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");
      const rows = await db
        .select({
          id: weddingMember.id,
          weddingId: weddingMember.weddingId,
          userId: weddingMember.userId,
          role: weddingMember.role,
          invitedEmail: weddingMember.invitedEmail,
          acceptedAt: weddingMember.acceptedAt,
          createdAt: weddingMember.createdAt,
          userName: userTable.name,
          userEmail: userTable.email,
        })
        .from(weddingMember)
        .leftJoin(userTable, eq(weddingMember.userId, userTable.id))
        .where(eq(weddingMember.weddingId, weddingId));
      return c.json(rows);
    },
  );

  // Remove a member (owner only, cannot remove self)
  app.delete(
    "/:weddingId/members/:memberId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const role = c.get("weddingRole");
      if (role !== "owner") {
        return c.json({ error: "Only owners can remove members" }, 403);
      }

      const memberId = c.req.param("memberId");
      const weddingId = c.req.param("weddingId");
      const user = c.get("user");

      const existing = await db
        .select()
        .from(weddingMember)
        .where(
          and(
            eq(weddingMember.id, memberId),
            eq(weddingMember.weddingId, weddingId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!existing) {
        return c.json({ error: "Member not found" }, 404);
      }

      if (existing.userId === user.id) {
        return c.json({ error: "Cannot remove yourself" }, 409);
      }

      await db.transaction(async (tx) => {
        const [removed] = await tx
          .delete(weddingMember)
          .where(
            and(
              eq(weddingMember.id, memberId),
              eq(weddingMember.weddingId, weddingId),
            ),
          )
          .returning();

        if (!removed) {
          return;
        }

        await recordAuditEvent(tx, {
          weddingId,
          actorUserId: user.id,
          eventType: "wedding.member.removed",
          targetType: "wedding_member",
          targetId: removed.id,
          metadata: {
            removedRole: removed.role,
            wasAccepted: Boolean(removed.acceptedAt || removed.userId),
          },
        });
      });
      return c.body(null, 204);
    },
  );

  // Archive a wedding (owner only)
  app.post(
    "/:weddingId/archive",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      if (c.get("weddingRole") !== "owner") {
        return c.json({ error: "Only owners can archive" }, 403);
      }
      const user = c.get("user");
      const weddingId = c.req.param("weddingId");
      const [updated] = await db
        .update(wedding)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(wedding.id, weddingId),
            sql`EXISTS (
              SELECT 1 FROM ${weddingMember}
              WHERE ${weddingMember.weddingId} = ${wedding.id}
                AND ${weddingMember.userId} = ${user.id}
                AND ${weddingMember.role} = 'owner'
            )`,
          ),
        )
        .returning();
      if (!updated) {
        return c.json({ error: "Wedding not found" }, 404);
      }
      return c.json(updated);
    },
  );

  // Unarchive a wedding (owner only)
  app.post(
    "/:weddingId/unarchive",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      if (c.get("weddingRole") !== "owner") {
        return c.json({ error: "Only owners can unarchive" }, 403);
      }
      const user = c.get("user");
      const weddingId = c.req.param("weddingId");
      const [updated] = await db
        .update(wedding)
        .set({ status: "planning", archivedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(wedding.id, weddingId),
            sql`EXISTS (
              SELECT 1 FROM ${weddingMember}
              WHERE ${weddingMember.weddingId} = ${wedding.id}
                AND ${weddingMember.userId} = ${user.id}
                AND ${weddingMember.role} = 'owner'
            )`,
          ),
        )
        .returning();
      if (!updated) {
        return c.json({ error: "Wedding not found" }, 404);
      }
      return c.json(updated);
    },
  );

  // Accept pending invites — links the authenticated user's ID to any
  // weddingMember rows that were created via email invite before the user
  // signed up (or had an account). Called after sign-up or sign-in.
  app.post("/accept-invite", requireSession, async (c) => {
    const user = c.get("user");
    const { body, response } = await readOptionalJsonObjectBody(c);
    if (response) return response;

    const inviteToken = body.inviteToken;

    if (typeof inviteToken !== "string" || inviteToken.length === 0) {
      return c.json({ error: "Invite token required" }, 403);
    }

    let invite;
    try {
      invite = await verifyMemberInviteToken(
        inviteToken,
        c.env.EMAIL_TOKEN_SECRET,
      );
    } catch {
      return c.json({ error: "Invalid invite token" }, 403);
    }

    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return c.json({ error: "Invite token does not match this user" }, 403);
    }

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM wedding WHERE id = ${invite.weddingId} FOR UPDATE`,
      );

      const [targetWedding] = await tx
        .select({ status: wedding.status })
        .from(wedding)
        .where(eq(wedding.id, invite.weddingId))
        .limit(1);

      if (!targetWedding) {
        return { status: "not-found" as const };
      }

      if (targetWedding.status === "archived") {
        return { status: "archived" as const };
      }

      const membersInTx = await tx
        .select()
        .from(weddingMember)
        .where(eq(weddingMember.weddingId, invite.weddingId));

      const additionalMembersAfterAccept = membersInTx.filter(
        (member) => member.role !== "owner",
      );
      let extraPlannerOwnerUserId: string | null = null;

      if (additionalMembersAfterAccept.length >= 2) {
        const ownerSubscription = await getWeddingOwnerSubscription(
          tx,
          invite.weddingId,
        );
        if (!subscriptionHasFeatureAccess(ownerSubscription, "extraPlanner")) {
          return {
            status: "billing-required" as const,
            ownerSubscription,
          };
        }
        extraPlannerOwnerUserId = ownerSubscription?.userId ?? null;
      }

      const accepted = await tx
        .update(weddingMember)
        .set({
          userId: user.id,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(weddingMember.id, invite.memberId),
            eq(weddingMember.weddingId, invite.weddingId),
            eq(weddingMember.role, invite.role),
            sql`lower(${weddingMember.invitedEmail}) = ${invite.email.toLowerCase()}`,
            isNull(weddingMember.userId),
            isNull(weddingMember.acceptedAt),
          ),
        )
        .returning();

      return {
        status: "accepted" as const,
        accepted,
        extraPlannerOwnerUserId,
      };
    });

    if (outcome.status === "not-found") {
      return c.json({ error: "Wedding not found" }, 404);
    }

    if (outcome.status === "archived") {
      return c.json({ error: "Wedding is archived and read-only" }, 423);
    }

    if (outcome.status === "billing-required") {
      const ownerSubscription = outcome.ownerSubscription;
      return c.json(
        {
          error: "Adding another planner requires a paid plan.",
          feature: "extraPlanner",
          plan: ownerSubscription?.plan ?? "free",
          status: ownerSubscription?.status ?? "inactive",
          effectivePlan: getEffectiveBillingPlan(ownerSubscription),
        },
        402,
      );
    }

    const accepted = outcome.accepted;

    if (accepted.length === 0) {
      return c.json({ error: "Invite token is no longer pending" }, 409);
    }

    if (outcome.extraPlannerOwnerUserId) {
      try {
        await recordFeatureFirstUse(
          db,
          outcome.extraPlannerOwnerUserId,
          "extraPlanner",
        );
      } catch (error) {
        console.warn("[member-invite] failed to record extra planner use", {
          userId: outcome.extraPlannerOwnerUserId,
          error,
        });
      }
    }

    return c.json({ accepted });
  });

  // Invite a member
  app.post(
    "/:weddingId/members",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");
      const role = c.get("weddingRole");
      const user = c.get("user");

      if (role !== "owner") {
        return c.json({ error: "Only owners can invite members" }, 403);
      }

      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = inviteMemberSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      // M1: normalize email to lowercase to prevent duplicate rows from
      // different-cased versions of the same address.
      const normalizedEmail = parsed.data.email.toLowerCase();

      if (normalizedEmail === user.email.toLowerCase()) {
        return c.json({ error: "Member already invited" }, 409);
      }

      const existing = await db
        .select()
        .from(weddingMember)
        .where(
          and(
            eq(weddingMember.weddingId, weddingId),
            sql`lower(${weddingMember.invitedEmail}) = ${normalizedEmail}`,
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (existing) {
        if (existing.acceptedAt !== null || existing.userId !== null) {
          return c.json({ error: "Member already invited" }, 409);
        }

        // H1 fix: apply the same paywall check on the re-invite path.
        // Count existing additional members (excluding current owner) to
        // determine if adding this re-invited member would exceed the free cap.
        // The pending invite being re-invited is itself one of the members, so
        // we exclude it from the "other additional" count — we're not adding
        // a new slot, just refreshing an existing pending row.
        const allMembers = await db
          .select()
          .from(weddingMember)
          .where(eq(weddingMember.weddingId, weddingId));

        const otherAdditionalMembers = allMembers.filter(
          (member) => member.userId !== user.id && member.id !== existing.id,
        );

        if (otherAdditionalMembers.length >= 1) {
          const ownerSubscription = await getWeddingOwnerSubscription(
            db,
            weddingId,
          );
          if (
            !subscriptionHasFeatureAccess(ownerSubscription, "extraPlanner")
          ) {
            return c.json(
              {
                error: "Adding another planner requires a paid plan.",
                feature: "extraPlanner",
                plan: ownerSubscription?.plan ?? "free",
                status: ownerSubscription?.status ?? "inactive",
                effectivePlan: getEffectiveBillingPlan(ownerSubscription),
              },
              402,
            );
          }
        }

        let updatedExisting: typeof existing | undefined;
        let delivery: InviteMemberDeliveryMetadata;
        try {
          updatedExisting = await db.transaction(async (tx) => {
            const [updated] = await tx
              .update(weddingMember)
              .set({ role: parsed.data.role })
              .where(
                and(
                  eq(weddingMember.id, existing.id),
                  eq(weddingMember.weddingId, weddingId),
                  sql`lower(${weddingMember.invitedEmail}) = ${normalizedEmail}`,
                  isNull(weddingMember.userId),
                  isNull(weddingMember.acceptedAt),
                ),
              )
              .returning();

            if (updated) {
              await recordAuditEvent(tx, {
                weddingId,
                actorUserId: user.id,
                eventType: "wedding.member.reinvited",
                targetType: "wedding_member",
                targetId: updated.id,
                metadata: {
                  role: updated.role,
                  deliveryStatus: "pending",
                },
              });
            }

            return updated;
          });

          if (!updatedExisting) {
            return c.json({ error: "Invite token is no longer pending" }, 409);
          }

          delivery = await emailService.sendMemberInvite({
            email: normalizedEmail,
            role: parsed.data.role,
            weddingId,
            memberId: updatedExisting.id,
            invitedBy: user,
          });
        } catch (error) {
          delivery = buildInviteDeliveryFailure(error);
          if (updatedExisting) {
            const failedUpdate = updatedExisting;
            await db.transaction(async (tx) => {
              await tx
                .update(weddingMember)
                .set({ role: existing.role })
                .where(
                  and(
                    eq(weddingMember.id, existing.id),
                    eq(weddingMember.weddingId, weddingId),
                    sql`lower(${weddingMember.invitedEmail}) = ${normalizedEmail}`,
                    isNull(weddingMember.userId),
                    isNull(weddingMember.acceptedAt),
                  ),
                );
              await recordAuditEvent(tx, {
                weddingId,
                actorUserId: user.id,
                eventType: "wedding.member.reinvite_delivery_failed",
                targetType: "wedding_member",
                targetId: failedUpdate.id,
                metadata: {
                  role: failedUpdate.role,
                  revertedRole: existing.role,
                },
              });
            });
          }
          return c.json(
            {
              error: "Failed to deliver invite email.",
              member: existing,
              delivery,
            },
            502,
          );
        }

        return c.json({ ...updatedExisting, delivery }, 200);
      }

      let member: typeof weddingMember.$inferSelect;
      let delivery: InviteMemberDeliveryMetadata;
      let extraPlannerOwnerUserId: string | null;

      try {
        // H2 fix: move the member-count paywall check inside the transaction
        // with a FOR UPDATE lock on the wedding row to prevent concurrent
        // invites both passing the cap check (TOCTOU race condition).
        const result = await db.transaction(async (tx) => {
          // Acquire a row-level lock on the wedding to serialize concurrent invites.
          await tx.execute(
            sql`SELECT id FROM wedding WHERE id = ${weddingId} FOR UPDATE`,
          );

          // Re-read member count inside the transaction (after the lock) so
          // concurrent requests cannot both pass the paywall check.
          const membersInTx = await tx
            .select()
            .from(weddingMember)
            .where(eq(weddingMember.weddingId, weddingId));

          // Exclude the current owner's row regardless of how the row was
          // created (owner may have an invitedEmail if they joined via invite).
          // Only match on userId so the owner is never counted as "additional".
          const additionalMembersInTx = membersInTx.filter(
            (member) => member.userId !== user.id,
          );
          let extraPlannerOwnerUserId: string | null = null;

          if (additionalMembersInTx.length >= 1) {
            const ownerSubscription = await getWeddingOwnerSubscription(
              tx,
              weddingId,
            );
            if (
              !subscriptionHasFeatureAccess(ownerSubscription, "extraPlanner")
            ) {
              return {
                paywallBlocked: true as const,
                ownerSubscription,
              };
            }
            extraPlannerOwnerUserId = ownerSubscription?.userId ?? null;
          }

          const insertedRows = await tx
            .insert(weddingMember)
            .values({
              weddingId,
              invitedEmail: normalizedEmail,
              role: parsed.data.role,
            })
            .returning();
          // insert().returning() always returns the inserted row.
          const inserted = insertedRows[0];
          if (!inserted) {
            throw new Error("Pending invite was not created.");
          }

          await recordAuditEvent(tx, {
            weddingId,
            actorUserId: user.id,
            eventType: "wedding.member.invited",
            targetType: "wedding_member",
            targetId: inserted.id,
            metadata: {
              role: inserted.role,
              deliveryStatus: "pending",
            },
          });

          return {
            paywallBlocked: false as const,
            inserted,
            extraPlannerOwnerUserId,
          };
        });

        if (result.paywallBlocked) {
          const ownerSubscription = result.ownerSubscription;
          return c.json(
            {
              error: "Adding another planner requires a paid plan.",
              feature: "extraPlanner",
              plan: ownerSubscription?.plan ?? "free",
              status: ownerSubscription?.status ?? "inactive",
              effectivePlan: getEffectiveBillingPlan(ownerSubscription),
            },
            402,
          );
        }

        member = result.inserted;
        extraPlannerOwnerUserId = result.extraPlannerOwnerUserId;
      } catch (error) {
        // PostgreSQL unique_violation (23505) means a concurrent invite for the
        // same email beat us to the insert. Surface this as a 409 so callers
        // know the invite already exists rather than treating it as a server error.
        if (
          error !== null &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: unknown }).code === "23505"
        ) {
          return c.json({ error: "Member already invited" }, 409);
        }
        console.error(
          "[member-invite] failed to create pending invite",
          summarizeCaughtError(error),
        );
        const failureDelivery = buildInviteDeliveryFailure(error);
        return c.json(
          {
            error: "Failed to create invite.",
            delivery: failureDelivery,
          },
          502,
        );
      }

      try {
        delivery = await emailService.sendMemberInvite({
          email: normalizedEmail,
          role: parsed.data.role,
          weddingId,
          memberId: member.id,
          invitedBy: user,
        });
        if (extraPlannerOwnerUserId) {
          try {
            await recordFeatureFirstUse(
              db,
              extraPlannerOwnerUserId,
              "extraPlanner",
            );
          } catch (error) {
            console.warn("[member-invite] failed to record extra planner use", {
              userId: extraPlannerOwnerUserId,
              error,
            });
          }
        }
      } catch (error) {
        await db.transaction(async (tx) => {
          await tx
            .delete(weddingMember)
            .where(
              and(
                eq(weddingMember.id, member.id),
                eq(weddingMember.weddingId, weddingId),
              ),
            );
          await recordAuditEvent(tx, {
            weddingId,
            actorUserId: user.id,
            eventType: "wedding.member.invite_delivery_failed",
            targetType: "wedding_member",
            targetId: member.id,
            metadata: {
              role: member.role,
              pendingInviteRemoved: true,
            },
          });
        });
        console.error(
          "[member-invite] email delivery failed; pending invite removed",
          summarizeCaughtError(error),
        );
        const failureDelivery = buildInviteDeliveryFailure(error);
        return c.json(
          {
            error: "Failed to deliver invite email.",
            delivery: failureDelivery,
          },
          502,
        );
      }

      return c.json({ ...member, delivery }, 201);
    },
  );

  // M2: Change a member's role (owner only)
  app.patch(
    "/:weddingId/members/:memberId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      if (c.get("weddingRole") !== "owner") {
        return c.json({ error: "Only owners can change member roles" }, 403);
      }

      const weddingId = c.req.param("weddingId");
      const memberId = c.req.param("memberId");
      const user = c.get("user");

      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = z
        .object({ role: z.enum(["editor", "viewer"]) })
        .safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      // Fetch the target member row to validate it exists and to prevent the
      // owner from changing their own role (userId matches the current user).
      const [targetMember] = await db
        .select()
        .from(weddingMember)
        .where(
          and(
            eq(weddingMember.id, memberId),
            eq(weddingMember.weddingId, weddingId),
          ),
        )
        .limit(1);

      if (!targetMember) {
        return c.json({ error: "Member not found" }, 404);
      }

      // Prevent the owner from changing their own role
      if (targetMember.userId === user.id) {
        return c.json({ error: "Cannot change your own role" }, 403);
      }

      if (targetMember.role === "owner") {
        return c.json({ error: "Cannot change an owner role" }, 403);
      }

      const result = await db.transaction(async (tx) => {
        const [currentTargetMember] = await tx
          .select()
          .from(weddingMember)
          .where(
            and(
              eq(weddingMember.id, memberId),
              eq(weddingMember.weddingId, weddingId),
            ),
          )
          .limit(1);

        if (!currentTargetMember) {
          return { status: "not-found" as const };
        }

        if (currentTargetMember.userId === user.id) {
          return {
            status: "forbidden" as const,
            error: "Cannot change your own role",
          };
        }

        if (currentTargetMember.role === "owner") {
          return {
            status: "forbidden" as const,
            error: "Cannot change an owner role",
          };
        }

        const [changed] = await tx
          .update(weddingMember)
          .set({ role: parsed.data.role, updatedAt: new Date() })
          .where(
            and(
              eq(weddingMember.id, memberId),
              eq(weddingMember.weddingId, weddingId),
              sql`${weddingMember.role} <> 'owner'`,
              sql`(${weddingMember.userId} IS NULL OR ${weddingMember.userId} <> ${user.id})`,
            ),
          )
          .returning();

        if (changed) {
          await recordAuditEvent(tx, {
            weddingId,
            actorUserId: user.id,
            eventType: "wedding.member.role_changed",
            targetType: "wedding_member",
            targetId: memberId,
            metadata: {
              previousRole: currentTargetMember.role,
              nextRole: changed.role,
            },
          });
        }

        if (!changed) {
          return { status: "conflict" as const };
        }

        return { status: "updated" as const, updated: changed };
      });

      if (result.status === "not-found") {
        return c.json({ error: "Member not found" }, 404);
      }

      if (result.status === "forbidden") {
        return c.json({ error: result.error }, 403);
      }

      if (result.status === "conflict") {
        return c.json({ error: "Member changed before role update" }, 409);
      }

      return c.json(result.updated);
    },
  );

  return app;
}
