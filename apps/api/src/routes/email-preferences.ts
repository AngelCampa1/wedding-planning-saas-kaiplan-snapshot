import { Hono } from "hono";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  emailPreferencesResponseSchema,
  publicEmailPreferencesResponseSchema,
  updateEmailPreferencesSchema,
} from "@kaiplan/shared";
import type { Auth } from "../auth";
import type { MarketingDatabase } from "../db/marketing-client";
import type { Env } from "../lib/env";
import {
  getDefaultEmailPreferences,
  verifyEmailPreferencesToken,
} from "../lib/email";
import { emailPreference, emailUnsubscribeToken } from "../db/marketing-schema";
import { sessionMiddleware } from "../middleware/session";
import { readJsonObjectBody } from "../lib/json-body";

type Variables = {
  user: { id: string; email: string; name: string };
};

type PreferenceRow = {
  email: string;
  weddingId: string | null;
  preferenceType:
    | "appLifecycle"
    | "memberInvite"
    | "rsvpConfirmation"
    | "rsvpReminder";
  enabled: boolean;
};
type PreferenceType = PreferenceRow["preferenceType"];

type StoredPreferenceToken = {
  id: string;
  email: string;
  weddingId: string | null;
  allowedTypes: string[];
  expiresAt: string;
};

class EmailPreferencesTokenNotFoundError extends Error {
  constructor() {
    super("EMAIL_PREFERENCES_TOKEN_NOT_FOUND");
  }
}

function normalizePreferenceEmail(email: string) {
  return email.trim().toLowerCase();
}

function mergePreferences(rows: PreferenceRow[]) {
  const merged = getDefaultEmailPreferences();

  for (const row of rows) {
    if (row.preferenceType in merged) {
      merged[row.preferenceType] = row.enabled;
    }
  }

  return merged;
}

async function loadPreferences(
  db: Pick<MarketingDatabase, "select">,
  input: { email: string; weddingId: string | null },
) {
  const email = normalizePreferenceEmail(input.email);
  const globalRows = (await db
    .select()
    .from(emailPreference)
    .where(
      and(eq(emailPreference.email, email), isNull(emailPreference.weddingId)),
    )) as PreferenceRow[];

  if (input.weddingId) {
    const weddingScoped = (await db
      .select()
      .from(emailPreference)
      .where(
        and(
          eq(emailPreference.email, email),
          eq(emailPreference.weddingId, input.weddingId),
        ),
      )) as PreferenceRow[];

    return mergePreferences([...globalRows, ...weddingScoped]);
  }

  return mergePreferences(globalRows);
}

async function replacePreferences(
  db: Pick<MarketingDatabase, "delete" | "insert">,
  input: {
    email: string;
    preferences: ReturnType<typeof getDefaultEmailPreferences>;
  },
) {
  const now = new Date().toISOString();
  const email = normalizePreferenceEmail(input.email);
  const rows = Object.entries(input.preferences).map(
    ([preferenceType, enabled]) => ({
      id: crypto.randomUUID(),
      email,
      weddingId: null,
      preferenceType,
      enabled,
      updatedAt: now,
      createdAt: now,
    }),
  );

  await db
    .delete(emailPreference)
    .where(
      and(eq(emailPreference.email, email), isNull(emailPreference.weddingId)),
    );

  await db.insert(emailPreference).values(rows);

  return input.preferences;
}

async function replaceAllowedPreferences(
  db: Pick<MarketingDatabase, "delete" | "insert" | "select">,
  input: {
    email: string;
    weddingId: string | null;
    requestedPreferences: ReturnType<typeof getDefaultEmailPreferences>;
    allowedTypes: Set<string>;
  },
) {
  const email = normalizePreferenceEmail(input.email);
  const currentPreferences = await loadPreferences(db, {
    email,
    weddingId: input.weddingId,
  });
  const preferenceTypes = (
    Object.keys(getDefaultEmailPreferences()) as PreferenceType[]
  ).filter((preferenceType) => input.allowedTypes.has(preferenceType));

  if (preferenceTypes.length === 0) {
    return currentPreferences;
  }

  const now = new Date().toISOString();
  const rows = preferenceTypes.map((preferenceType) => ({
    id: crypto.randomUUID(),
    email,
    weddingId: input.weddingId,
    preferenceType,
    enabled: input.requestedPreferences[preferenceType],
    updatedAt: now,
    createdAt: now,
  }));

  await db
    .delete(emailPreference)
    .where(
      and(
        eq(emailPreference.email, email),
        input.weddingId === null
          ? isNull(emailPreference.weddingId)
          : eq(emailPreference.weddingId, input.weddingId),
        inArray(emailPreference.preferenceType, preferenceTypes),
      ),
    );

  await db.insert(emailPreference).values(rows);

  return {
    ...currentPreferences,
    ...Object.fromEntries(
      preferenceTypes.map((preferenceType) => [
        preferenceType,
        input.requestedPreferences[preferenceType],
      ]),
    ),
  } as ReturnType<typeof getDefaultEmailPreferences>;
}

async function loadStoredPreferenceToken(
  db: Pick<MarketingDatabase, "select">,
  payload: Awaited<ReturnType<typeof verifyEmailPreferencesToken>>,
) {
  const tokenRows = (await db
    .select()
    .from(emailUnsubscribeToken)
    .where(eq(emailUnsubscribeToken.id, payload.tokenId))) as
    | StoredPreferenceToken[]
    | [];

  const tokenRow = tokenRows[0];
  if (!tokenRow) {
    return null;
  }

  if (
    normalizePreferenceEmail(tokenRow.email) !==
      normalizePreferenceEmail(payload.email) ||
    tokenRow.weddingId !== payload.weddingId ||
    JSON.stringify([...tokenRow.allowedTypes].sort()) !==
      JSON.stringify([...payload.allowedTypes].sort())
  ) {
    return null;
  }

  const storedExpiresAt = new Date(tokenRow.expiresAt).getTime();
  if (!Number.isFinite(storedExpiresAt) || storedExpiresAt <= Date.now()) {
    return null;
  }

  return tokenRow;
}

async function replaceAllowedPreferencesForStoredToken(
  db: Pick<MarketingDatabase, "delete" | "insert" | "select">,
  input: {
    payload: Awaited<ReturnType<typeof verifyEmailPreferencesToken>>;
    requestedPreferences: ReturnType<typeof getDefaultEmailPreferences>;
  },
) {
  const tokenRow = await loadStoredPreferenceToken(db, input.payload);
  if (!tokenRow) {
    throw new EmailPreferencesTokenNotFoundError();
  }

  return replaceAllowedPreferences(db, {
    email: input.payload.email,
    weddingId: input.payload.weddingId,
    requestedPreferences: input.requestedPreferences,
    allowedTypes: new Set<string>(input.payload.allowedTypes),
  });
}

function emailPreferencesTokenNotFoundResponse(error: unknown) {
  if (error instanceof EmailPreferencesTokenNotFoundError) {
    return new Response(
      JSON.stringify({ error: "Email preferences token not found." }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      },
    );
  }

  throw error;
}

function allAllowedPreferencesDisabled(
  allowedTypes: Set<string>,
): ReturnType<typeof getDefaultEmailPreferences> {
  const next = getDefaultEmailPreferences();
  for (const key of Object.keys(next) as PreferenceType[]) {
    if (allowedTypes.has(key)) {
      next[key] = false;
    }
  }
  return next;
}

export function emailPreferencesRoutes(db: MarketingDatabase, auth: Auth) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  const requireSession = sessionMiddleware(auth);

  app.get("/", requireSession, async (c) => {
    const user = c.get("user");
    const email = normalizePreferenceEmail(user.email);
    const preferences = await loadPreferences(db, {
      email,
      weddingId: null,
    });

    return c.json(
      emailPreferencesResponseSchema.parse({
        email,
        preferences,
      }),
    );
  });

  app.patch("/", requireSession, async (c) => {
    const user = c.get("user");
    const email = normalizePreferenceEmail(user.email);
    const { body, response } = await readJsonObjectBody(c);
    if (response) return response;

    const parsed = updateEmailPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const preferences = await db.transaction((tx) =>
      replacePreferences(tx, {
        email,
        preferences: parsed.data.preferences,
      }),
    );

    return c.json(
      emailPreferencesResponseSchema.parse({
        email,
        preferences,
      }),
    );
  });

  return app;
}

export function publicEmailPreferencesRoutes(db: MarketingDatabase) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/:token", async (c) => {
    const secret = c.env.EMAIL_TOKEN_SECRET;
    const token = c.req.param("token");
    let payload;

    try {
      payload = await verifyEmailPreferencesToken(token, secret);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid email preferences token.",
        },
        400,
      );
    }

    const tokenRow = await loadStoredPreferenceToken(db, payload);

    if (!tokenRow) {
      return c.json({ error: "Email preferences token not found." }, 404);
    }

    const email = normalizePreferenceEmail(payload.email);
    const preferences = await loadPreferences(db, {
      email,
      weddingId: payload.weddingId,
    });

    return c.json(
      publicEmailPreferencesResponseSchema.parse({
        email,
        allowedTypes: payload.allowedTypes,
        preferences,
      }),
    );
  });

  app.patch("/:token", async (c) => {
    const secret = c.env.EMAIL_TOKEN_SECRET;
    const token = c.req.param("token");
    let payload;

    try {
      payload = await verifyEmailPreferencesToken(token, secret);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid email preferences token.",
        },
        400,
      );
    }

    const { body, response } = await readJsonObjectBody(c);
    if (response) return response;

    const parsed = updateEmailPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    let result: ReturnType<typeof getDefaultEmailPreferences>;
    try {
      result = await db.transaction(async (tx) =>
        replaceAllowedPreferencesForStoredToken(tx, {
          payload,
          requestedPreferences: parsed.data.preferences,
        }),
      );
    } catch (error) {
      return emailPreferencesTokenNotFoundResponse(error);
    }

    return c.json(
      publicEmailPreferencesResponseSchema.parse({
        email: normalizePreferenceEmail(payload.email),
        allowedTypes: payload.allowedTypes,
        preferences: result,
      }),
    );
  });

  app.post("/:token", async (c) => {
    const secret = c.env.EMAIL_TOKEN_SECRET;
    const token = c.req.param("token");
    let payload;

    try {
      payload = await verifyEmailPreferencesToken(token, secret);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid email preferences token.",
        },
        400,
      );
    }

    const body = await c.req.text();
    if (body.trim() !== "List-Unsubscribe=One-Click") {
      return c.json({ error: "Invalid one-click unsubscribe request." }, 400);
    }

    const allowedTypes = new Set<string>(payload.allowedTypes);
    let preferences: ReturnType<typeof getDefaultEmailPreferences>;
    try {
      preferences = await db.transaction(async (tx) =>
        replaceAllowedPreferencesForStoredToken(tx, {
          payload,
          requestedPreferences: allAllowedPreferencesDisabled(allowedTypes),
        }),
      );
    } catch (error) {
      return emailPreferencesTokenNotFoundResponse(error);
    }

    return c.json(
      publicEmailPreferencesResponseSchema.parse({
        email: normalizePreferenceEmail(payload.email),
        allowedTypes: payload.allowedTypes,
        preferences,
      }),
    );
  });

  return app;
}
