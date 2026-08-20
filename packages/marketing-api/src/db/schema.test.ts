import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import {
  signups,
  pricingClicks,
  surveyResponses,
  referrals,
  feedback,
  leadMagnetDownloads,
  schema,
} from "./schema";
import { makeDb } from "../integration/setup";

describe("signups schema", () => {
  it("has surveyCompleted column", () => {
    const columns = getTableColumns(signups);
    expect(columns.surveyCompleted).toBeDefined();
    expect(columns.surveyCompleted.name).toBe("survey_completed");
  });

  it("has reminderSent column", () => {
    const columns = getTableColumns(signups);
    expect(columns.reminderSent).toBeDefined();
    expect(columns.reminderSent.name).toBe("reminder_sent");
  });

  it("has local unsubscribe suppression column", () => {
    const columns = getTableColumns(signups);
    expect(columns.unsubscribedAt).toBeDefined();
    expect(columns.unsubscribedAt.name).toBe("unsubscribed_at");
    expect(Object.values(columns).map((column) => column.name)).not.toContain(
      "nurture_unsubscribed_at",
    );
  });

  it("has queuePosition and persisted lead magnet delivery columns", () => {
    const columns = getTableColumns(signups);
    expect(columns.queuePosition).toBeDefined();
    expect(columns.queuePosition.name).toBe("queue_position");
    expect(columns.leadMagnetTitle).toBeDefined();
    expect(columns.leadMagnetTitle.name).toBe("lead_magnet_title");
    expect(columns.leadMagnetUrl).toBeDefined();
    expect(columns.leadMagnetUrl.name).toBe("lead_magnet_url");
  });
});

describe("pricingClicks schema", () => {
  it("has expected columns", () => {
    const columns = getTableColumns(pricingClicks);
    expect(columns.id).toBeDefined();
    expect(columns.tier).toBeDefined();
    expect(columns.sourcePage.name).toBe("source_page");
    expect(columns.sessionId.name).toBe("session_id");
    expect(columns.createdAt.name).toBe("created_at");
  });
});

describe("surveyResponses schema", () => {
  it("has expected columns", () => {
    const columns = getTableColumns(surveyResponses);
    expect(columns.signupEmail.name).toBe("signup_email");
    expect(columns.questionId.name).toBe("question_id");
    expect(columns.answer).toBeDefined();
    expect(columns.createdAt.name).toBe("created_at");
  });
});

describe("referrals schema", () => {
  it("has expected columns", () => {
    const columns = getTableColumns(referrals);
    expect(columns.referrerEmail.name).toBe("referrer_email");
    expect(columns.referralCode.name).toBe("referral_code");
    expect(columns.referredEmail.name).toBe("referred_email");
    expect(columns.createdAt.name).toBe("created_at");
  });
});

describe("feedback schema", () => {
  it("exports feedback table", () => {
    expect(feedback).toBeDefined();
  });

  it("has expected columns", () => {
    const columns = getTableColumns(feedback);
    expect(columns.id).toBeDefined();
    expect(columns.category).toBeDefined();
    expect(columns.message).toBeDefined();
    expect(columns.email).toBeDefined();
    expect(columns.pageUrl.name).toBe("page_url");
    expect(columns.userAgent.name).toBe("user_agent");
    expect(columns.createdAt.name).toBe("created_at");
  });
});

describe("schema export", () => {
  it("contains all seven tables", () => {
    expect(schema.signups).toBe(signups);
    expect(schema.pricingClicks).toBe(pricingClicks);
    expect(schema.surveyResponses).toBe(surveyResponses);
    expect(schema.referrals).toBe(referrals);
    expect(schema.feedback).toBe(feedback);
    expect(schema.leadMagnetDownloads).toBe(leadMagnetDownloads);
  });
});

describe("leadMagnetDownloads schema", () => {
  it("exposes expected columns with snake_case names", () => {
    const columns = getTableColumns(leadMagnetDownloads);
    expect(columns.signupEmail.name).toBe("signup_email");
    expect(columns.leadMagnetSlug.name).toBe("lead_magnet_slug");
    expect(columns.downloadToken.name).toBe("download_token");
    expect(columns.expiresAt.name).toBe("expires_at");
    expect(columns.downloadedAt.name).toBe("downloaded_at");
    expect(columns.emailSentAt.name).toBe("email_sent_at");
    expect(columns.downloadCount.name).toBe("download_count");
    expect(columns.createdAt.name).toBe("created_at");
  });

  it("has a unique index on (signup_email, lead_magnet_slug)", () => {
    const cfg = getTableConfig(leadMagnetDownloads);
    const uniqueIdx = cfg.indexes.find(
      (idx) =>
        idx.config.unique === true &&
        idx.config.columns.length === 2 &&
        idx.config.columns.some(
          (c) => colName(c as unknown) === "signup_email",
        ) &&
        idx.config.columns.some(
          (c) => colName(c as unknown) === "lead_magnet_slug",
        ),
    );
    expect(uniqueIdx).toBeDefined();
  });

  it("references signups.email via foreign key", () => {
    const cfg = getTableConfig(leadMagnetDownloads);
    expect(cfg.foreignKeys.length).toBeGreaterThan(0);
    const ref = cfg.foreignKeys[0]!.reference();
    expect(getTableName(ref.foreignTable)).toBe("signups");
    expect(ref.foreignColumns.map((c) => c.name)).toContain("email");
  });

  it("inserts and selects a row end-to-end against libsql", async () => {
    const db = await makeDb();
    await db.insert(signups).values({
      email: "lm-download@example.com",
      sourcePage: "/",
      referralCode: "LMCODE01",
      surveyToken: "a".repeat(32),
      createdAt: "2026-04-20T00:00:00.000Z",
    });
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "lm-download@example.com",
      leadMagnetSlug: "budget-template",
      downloadToken: "a".repeat(64),
      expiresAt: "2026-05-20T00:00:00.000Z",
      createdAt: "2026-04-20T00:00:00.000Z",
    });
    const rows = await db
      .select()
      .from(leadMagnetDownloads)
      .where(eq(leadMagnetDownloads.signupEmail, "lm-download@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.downloadCount).toBe(0);
    expect(rows[0]!.downloadedAt).toBeNull();
    expect(rows[0]!.emailSentAt).toBeNull();
  });
});

// BUG 6 — referrals must have a unique index on (referralCode, referredEmail)
// BUG 1 — surveyResponses must have a unique index on (signupEmail, questionId)

/** Returns the SQL column name for an IndexColumn, or undefined when it is a raw SQL expression. */
function colName(c: unknown): string | undefined {
  if (
    c !== null &&
    typeof c === "object" &&
    "name" in c &&
    typeof (c as { name: unknown }).name === "string"
  ) {
    return (c as { name: string }).name;
  }
  return undefined;
}

describe("unique index constraints — BUG 1, BUG 6", () => {
  it("surveyResponses has a unique index on (signup_email, question_id)", () => {
    const cfg = getTableConfig(surveyResponses);
    const uniqueIdx = cfg.indexes.find(
      (idx) =>
        idx.config.unique === true &&
        idx.config.columns.length === 2 &&
        idx.config.columns.some(
          (c) => colName(c as unknown) === "signup_email",
        ) &&
        idx.config.columns.some((c) => colName(c as unknown) === "question_id"),
    );
    expect(uniqueIdx).toBeDefined();
  });

  it("referrals has a unique index on (referral_code, referred_email)", () => {
    const cfg = getTableConfig(referrals);
    const uniqueIdx = cfg.indexes.find(
      (idx) =>
        idx.config.unique === true &&
        idx.config.columns.length === 2 &&
        idx.config.columns.some(
          (c) => colName(c as unknown) === "referral_code",
        ) &&
        idx.config.columns.some(
          (c) => colName(c as unknown) === "referred_email",
        ),
    );
    expect(uniqueIdx).toBeDefined();
  });
});

// H1 — surveyResponses.signupEmail must have FK → signups.email
describe("FK constraints — H1, H2", () => {
  it("surveyResponses has a foreign key constraint on signup_email → signups.email", () => {
    const cfg = getTableConfig(surveyResponses);
    expect(cfg.foreignKeys.length).toBeGreaterThan(0);
    const fk = cfg.foreignKeys[0]!;
    const ref = fk.reference();
    const foreignColNames = ref.foreignColumns.map((c) => c.name);
    expect(foreignColNames).toContain("email");
    expect(getTableName(ref.foreignTable)).toBe("signups");
  });

  it("referrals has a foreign key constraint on referrer_email → signups.email", () => {
    const cfg = getTableConfig(referrals);
    expect(cfg.foreignKeys.length).toBeGreaterThan(0);
    const fk = cfg.foreignKeys[0]!;
    const ref = fk.reference();
    const foreignColNames = ref.foreignColumns.map((c) => c.name);
    expect(foreignColNames).toContain("email");
    expect(getTableName(ref.foreignTable)).toBe("signups");
  });
});
