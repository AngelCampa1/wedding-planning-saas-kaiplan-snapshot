import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { leadMagnetDownloads } from "../db/schema";
import type { ApiEnv, DrizzleD1Database } from "../app";
import { captureServerEvent } from "../services/analytics";
import { scheduleBackgroundTask } from "../lib/background-task";
import { captureMarketingApiException } from "../services/sentry";

const TOKEN_REGEX = /^[0-9a-f]{64}$/;

async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function leadMagnetDownloadRoute() {
  const route = new Hono<{
    Bindings: ApiEnv;
    Variables: { db: DrizzleD1Database };
  }>();

  route.get("/download", async (c) => {
    const token = c.req.query("token") ?? "";
    if (!TOKEN_REGEX.test(token)) {
      return c.json({ error: "invalid_token" }, 400);
    }

    const db = c.get("db");
    let row:
      | (typeof leadMagnetDownloads.$inferSelect)
      | undefined;
    try {
      [row] = await db
        .select()
        .from(leadMagnetDownloads)
        .where(eq(leadMagnetDownloads.downloadToken, token));
    } catch (error) {
      console.error("[lead-magnet-download] token lookup failed", error);
      captureMarketingApiException(error, {
        source: "lead-magnet-download-lookup",
      });
      return c.json({ error: "internal_error" }, 500);
    }

    if (!row) {
      return c.json({ error: "not_found" }, 404);
    }

    const now = new Date();
    if (new Date(row.expiresAt).getTime() < now.getTime()) {
      return c.json({ error: "expired" }, 410);
    }

    const slug = row.leadMagnetSlug;
    const env = c.env;

    if (!env.LEAD_MAGNETS_R2) {
      return c.json({ error: "asset_storage_unavailable" }, 503);
    }

    let object: R2ObjectBody | null;
    try {
      object = await env.LEAD_MAGNETS_R2.get(`${slug}.pdf`);
    } catch (error) {
      console.error("[lead-magnet-download] R2 fetch failed", error);
      captureMarketingApiException(error, {
        source: "lead-magnet-download-r2",
      });
      return c.json({ error: "asset_storage_unavailable" }, 503);
    }
    if (!object) {
      return c.json({ error: "asset_missing" }, 404);
    }

    const nowIso = now.toISOString();
    let updatedDownload: { downloadCount: number } | undefined;
    try {
      [updatedDownload] = await db
        .update(leadMagnetDownloads)
        .set({
          downloadCount: sql`${leadMagnetDownloads.downloadCount} + 1`,
          downloadedAt: sql`coalesce(${leadMagnetDownloads.downloadedAt}, ${nowIso})`,
        })
        .where(
          and(
            eq(leadMagnetDownloads.id, row.id),
            eq(leadMagnetDownloads.downloadToken, token),
            sql`${leadMagnetDownloads.expiresAt} >= ${nowIso}`,
          ),
        )
        .returning({
          downloadCount: leadMagnetDownloads.downloadCount,
        });
    } catch (error) {
      console.error("[lead-magnet-download] counter update failed", error);
      captureMarketingApiException(error, {
        source: "lead-magnet-download-counter",
      });
      return c.json({ error: "internal_error" }, 500);
    }
    if (!updatedDownload) {
      return c.json({ error: "not_found" }, 404);
    }
    const downloadCount = updatedDownload.downloadCount;

    if (env.POSTHOG_API_KEY) {
      const captureTask = (async () => {
        const distinctId = await hashEmail(row.signupEmail);
        await captureServerEvent({
          apiKey: env.POSTHOG_API_KEY,
          distinctId,
          event: "lead_magnet_pdf_downloaded",
          properties: {
            slug,
            downloadCount,
            expired: false,
          },
        });
      })();
      scheduleBackgroundTask(c, captureTask);
    }

    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, noarchive",
      },
    });
  });

  return route;
}
