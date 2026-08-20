import { sql } from "drizzle-orm";
import { auditLog } from "../db/schema";
import type { Database } from "../db/client";

type AuditMetadata = Record<string, string | number | boolean | null>;

export type AuditEventInput = {
  weddingId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  targetType: string;
  targetId?: string | null;
  metadata?: AuditMetadata;
};

export async function recordAuditEvent(
  db: Pick<Database, "insert"> & Partial<Pick<Database, "execute">>,
  input: AuditEventInput,
) {
  if (!(await auditLogTableExists(db))) {
    return;
  }

  await db.insert(auditLog).values({
    weddingId: input.weddingId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function recordAuditEventBestEffort(
  db: Pick<Database, "insert"> & Partial<Pick<Database, "execute">>,
  input: AuditEventInput,
) {
  try {
    await recordAuditEvent(db, input);
  } catch (error) {
    console.warn("[audit-log] failed to write audit event", {
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      errorName: error instanceof Error ? error.name : "NonError",
    });
  }
}

async function auditLogTableExists(
  db: Pick<Database, "insert"> & Partial<Pick<Database, "execute">>,
) {
  if (typeof db.execute !== "function") {
    return true;
  }

  const result = (await db.execute(
    sql`select to_regclass('public.audit_log') as audit_log_table`,
  )) as
    | Array<{ audit_log_table?: string | null }>
    | { rows?: Array<{ audit_log_table?: string | null }> }
    | undefined;
  if (!result) {
    return true;
  }

  const rows = Array.isArray(result) ? result : (result.rows ?? []);
  if (rows.length === 0) {
    return true;
  }

  const tableName = rows[0]?.audit_log_table;

  return tableName === "audit_log" || tableName === "public.audit_log";
}
