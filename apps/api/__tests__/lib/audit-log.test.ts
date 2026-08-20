import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog } from "../../src/db/schema";
import {
  recordAuditEvent,
  recordAuditEventBestEffort,
} from "../../src/lib/audit-log";

function makeInsertMock() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return { db: { insert }, insert, values };
}

describe("audit log helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("writes an audit event with explicit values", async () => {
    const { db, insert, values } = makeInsertMock();

    await recordAuditEvent(db, {
      weddingId: "wedding-1",
      actorUserId: "user-1",
      eventType: "wedding.member.invited",
      targetType: "wedding_member",
      targetId: "member-1",
      metadata: { role: "editor", deliveryPending: true },
    });

    expect(insert).toHaveBeenCalledWith(auditLog);
    expect(values).toHaveBeenCalledWith({
      weddingId: "wedding-1",
      actorUserId: "user-1",
      eventType: "wedding.member.invited",
      targetType: "wedding_member",
      targetId: "member-1",
      metadata: { role: "editor", deliveryPending: true },
    });
  });

  it("defaults nullable columns and metadata", async () => {
    const { values, db } = makeInsertMock();

    await recordAuditEvent(db, {
      eventType: "billing.plan.changed",
      targetType: "subscription",
    });

    expect(values).toHaveBeenCalledWith({
      weddingId: null,
      actorUserId: null,
      eventType: "billing.plan.changed",
      targetType: "subscription",
      targetId: null,
      metadata: {},
    });
  });

  it("skips required audit writes when the audit table is not deployed yet", async () => {
    const { db, insert } = makeInsertMock();
    const execute = vi.fn().mockResolvedValue({
      rows: [{ audit_log_table: null }],
    });

    await recordAuditEvent(
      { ...db, execute },
      {
        eventType: "billing.plan.changed",
        targetType: "subscription",
      },
    );

    expect(execute).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not warn when best-effort writes succeed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db } = makeInsertMock();

    await recordAuditEventBestEffort(db, {
      eventType: "billing.plan.changed",
      targetType: "subscription",
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns with error names when best-effort writes fail with Error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const insert = vi.fn(() => ({
      values: vi.fn().mockRejectedValue(new TypeError("db unavailable")),
    }));

    await recordAuditEventBestEffort(
      { insert },
      {
        eventType: "wedding.member.removed",
        targetType: "wedding_member",
        targetId: "member-1",
      },
    );

    expect(warn).toHaveBeenCalledWith(
      "[audit-log] failed to write audit event",
      {
        eventType: "wedding.member.removed",
        targetType: "wedding_member",
        targetId: "member-1",
        errorName: "TypeError",
      },
    );
  });

  it("warns with NonError for non-Error best-effort failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const insert = vi.fn(() => ({
      values: vi.fn().mockRejectedValue("db unavailable"),
    }));

    await recordAuditEventBestEffort(
      { insert },
      {
        eventType: "wedding.member.role_changed",
        targetType: "wedding_member",
      },
    );

    expect(warn).toHaveBeenCalledWith(
      "[audit-log] failed to write audit event",
      {
        eventType: "wedding.member.role_changed",
        targetType: "wedding_member",
        targetId: undefined,
        errorName: "NonError",
      },
    );
  });
});
