/**
 * Screenshot capture script for apps/web/public/screenshots/.
 *
 * Usage: pnpm exec tsx scripts/capture-screenshots.ts
 *
 * Requires the local e2e stack to already be running:
 *   - Docker Postgres at 55432 (kaiplan-e2e-db)
 *   - Local API at 5030 (scripts/serve-local-api.ts)
 *   - Local App at 3030 (apps/app vite)
 */

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { readLocalE2ERuntime } from "./local-e2e-config";
import { completeLocalCheckoutWithCookie } from "./local-e2e-billing";

/**
 * Splits a raw "name=value" cookie string at the first `=` only,
 * so that `=` characters inside the value (e.g. base64 padding) are preserved.
 */
export function parseCookiePair(cookie: string): {
  name: string;
  value: string;
} {
  const eqIdx = cookie.indexOf("=");
  if (eqIdx === -1) {
    return { name: cookie, value: "" };
  }
  return {
    name: cookie.slice(0, eqIdx),
    value: cookie.slice(eqIdx + 1),
  };
}

const runtime = readLocalE2ERuntime();
const API = runtime.urls.api;
const APP = runtime.urls.app;
const OUT_DIR = path.join(process.cwd(), "apps/web/public/screenshots");

const VIEWPORT = { width: 1440, height: 900 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(url: string, body: unknown, cookie: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: APP,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function put(url: string, body: unknown, cookie: string) {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: APP,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PUT ${url} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function createSession() {
  const email = `screenshots-${randomUUID()}@example.com`;
  const password = "supersecret123";

  const signupRes = await fetch(`${API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: API },
    body: JSON.stringify({
      name: "Demo User",
      email,
      password,
      callbackURL: "/dashboard",
    }),
  });
  if (!signupRes.ok)
    throw new Error(`signup failed: ${await signupRes.text()}`);

  const signinRes = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: API },
    body: JSON.stringify({ email, password, callbackURL: "/dashboard" }),
  });
  if (!signinRes.ok)
    throw new Error(`signin failed: ${await signinRes.text()}`);

  const setCookieHeader = signinRes.headers.get("set-cookie") ?? "";
  const [cookiePair] = setCookieHeader.split(";");
  if (!cookiePair) throw new Error("No session cookie in signin response");

  return { email, cookie: cookiePair };
}

// ---------------------------------------------------------------------------
// Billing (E2E mode - mirrors e2e/helpers/local-billing.ts)
// ---------------------------------------------------------------------------

async function activateSubscription(_email: string, cookie: string) {
  await completeLocalCheckoutWithCookie({
    apiUrl: API,
    appUrl: APP,
    cookie,
    plan: "pro",
  });
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function seedWedding(cookie: string) {
  return post(
    `${API}/api/weddings`,
    {
      name: "Alex & Jordan",
      date: "2027-06-20",
      budgetCents: 3000000,
      currency: "USD",
      timezone: "America/New_York",
    },
    cookie,
  ) as Promise<{ id: string }>;
}

async function seedBudget(weddingId: string, cookie: string) {
  // Category: Venue
  const venue = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    {
      name: "Venue",
      estimatedCents: 1200000,
    },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${venue.id}/items`,
    {
      name: "The Grand Ballroom — rental fee",
      estimatedCents: 1200000,
      quotedCents: 1150000,
      paidCents: 500000,
      notes: "Deposit paid. Balance due 30 days before.",
    },
    cookie,
  );

  // Category: Photography
  const photo = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    {
      name: "Photography",
      estimatedCents: 400000,
    },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${photo.id}/items`,
    {
      name: "8-hour coverage + second shooter",
      estimatedCents: 400000,
      quotedCents: 380000,
      paidCents: 150000,
      notes: "Contract signed. Remaining due 2 weeks before.",
    },
    cookie,
  );

  // Category: Catering
  const catering = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    {
      name: "Catering",
      estimatedCents: 800000,
    },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${catering.id}/items`,
    {
      name: "Dinner — 80 guests @ $85/head",
      estimatedCents: 680000,
      quotedCents: 700000,
      paidCents: 0,
      notes: "Final headcount needed 3 weeks out.",
    },
    cookie,
  );

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${catering.id}/items`,
    {
      name: "Open bar — 5 hours",
      estimatedCents: 120000,
      quotedCents: 115000,
      paidCents: 0,
    },
    cookie,
  );

  // Category: Florals
  const florals = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    {
      name: "Florals",
      estimatedCents: 300000,
    },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${florals.id}/items`,
    {
      name: "Ceremony arch + table centrepieces",
      estimatedCents: 300000,
      quotedCents: 290000,
      paidCents: 100000,
    },
    cookie,
  );

  return {
    venueId: venue.id,
    photoId: photo.id,
    cateringId: catering.id,
    floralsId: florals.id,
  };
}

async function seedGuests(weddingId: string, cookie: string) {
  const guests = [
    {
      firstName: "Margaret",
      lastName: "Chen",
      rsvpStatus: "accepted",
      side: "partner1",
      groupName: "Family",
    },
    {
      firstName: "David",
      lastName: "Chen",
      rsvpStatus: "accepted",
      side: "partner1",
      groupName: "Family",
    },
    {
      firstName: "Lily",
      lastName: "Chen",
      rsvpStatus: "accepted",
      side: "partner1",
      groupName: "Family",
    },
    {
      firstName: "Robert",
      lastName: "Park",
      rsvpStatus: "accepted",
      side: "partner2",
      groupName: "Family",
    },
    {
      firstName: "Susan",
      lastName: "Park",
      rsvpStatus: "accepted",
      side: "partner2",
      groupName: "Family",
    },
    {
      firstName: "Emily",
      lastName: "Torres",
      rsvpStatus: "accepted",
      side: "partner1",
      groupName: "Friends",
    },
    {
      firstName: "Jason",
      lastName: "Rivera",
      rsvpStatus: "accepted",
      side: "partner2",
      groupName: "Friends",
    },
    {
      firstName: "Nina",
      lastName: "Patel",
      rsvpStatus: "accepted",
      side: "partner1",
      groupName: "Friends",
    },
    {
      firstName: "Carlos",
      lastName: "Mendez",
      rsvpStatus: "invited",
      side: "partner2",
      groupName: "Friends",
    },
    {
      firstName: "Sofia",
      lastName: "Nguyen",
      rsvpStatus: "invited",
      side: "partner1",
      groupName: "Friends",
    },
    {
      firstName: "Tyler",
      lastName: "Brooks",
      rsvpStatus: "declined",
      side: "partner2",
      groupName: "Friends",
    },
    {
      firstName: "Hannah",
      lastName: "Kim",
      rsvpStatus: "accepted",
      side: "partner1",
      groupName: "Coworkers",
    },
    {
      firstName: "Marcus",
      lastName: "Webb",
      rsvpStatus: "accepted",
      side: "partner2",
      groupName: "Coworkers",
    },
    {
      firstName: "Priya",
      lastName: "Sharma",
      rsvpStatus: "invited",
      side: "partner1",
      groupName: "Coworkers",
    },
    {
      firstName: "Owen",
      lastName: "Foster",
      rsvpStatus: "accepted",
      side: "partner2",
      groupName: "Coworkers",
    },
    {
      firstName: "Isabelle",
      lastName: "Dumont",
      rsvpStatus: "accepted",
      side: "partner1",
      groupName: "Friends",
    },
  ] as const;

  const created: {
    id: string;
    firstName: string;
    lastName: string;
    rsvpStatus: string;
  }[] = [];
  for (const g of guests) {
    const created_g = (await post(
      `${API}/api/weddings/${weddingId}/guests`,
      g,
      cookie,
    )) as {
      id: string;
      firstName: string;
      lastName: string;
      rsvpStatus: string;
    };
    created.push(created_g);
  }
  return created;
}

async function seedVendors(
  weddingId: string,
  categoryIds: {
    venueId: string;
    photoId: string;
    cateringId: string;
    floralsId: string;
  },
  cookie: string,
) {
  const vendors = [
    {
      companyName: "The Grand Ballroom",
      categoryId: categoryIds.venueId,
      contractStatus: "signed",
      primaryContactName: "Maria Santos",
      email: "maria@granballroom.example",
      phone: "555-0101",
      notes: "Parking for 60 cars included.",
    },
    {
      companyName: "Aperture Studios",
      categoryId: categoryIds.photoId,
      contractStatus: "signed",
      primaryContactName: "James Lau",
      email: "james@aperture.example",
      phone: "555-0202",
      notes: "8-hour coverage, 2nd shooter, online gallery.",
    },
    {
      companyName: "Harvest Table Catering",
      categoryId: categoryIds.cateringId,
      contractStatus: "sent",
      primaryContactName: "Claire Dubois",
      email: "claire@harvesttable.example",
      phone: "555-0303",
      notes: "Final headcount due 3 weeks out.",
    },
    {
      companyName: "Bloom & Branch Florals",
      categoryId: categoryIds.floralsId,
      contractStatus: "none",
      primaryContactName: "Anika Johansson",
      email: "anika@bloomfloral.example",
      notes: "Prefer seasonal flowers. Awaiting final quote.",
    },
    {
      companyName: "Sonata Strings Quartet",
      categoryId: categoryIds.venueId,
      contractStatus: "none",
      primaryContactName: "Rafael Cruz",
      email: "rafael@sonataquartet.example",
      notes: "Ceremony music only. Negotiating.",
    },
  ];

  for (const v of vendors) {
    await post(`${API}/api/weddings/${weddingId}/vendors`, v, cookie);
  }
}

async function seedSeating(
  weddingId: string,
  confirmedGuests: { id: string }[],
  cookie: string,
) {
  const confirmedIds = confirmedGuests.map((g) => g.id);

  const makeSeats = (capacity: number, guestIds: string[]) =>
    Array.from({ length: capacity }, (_, i) => ({
      id: randomUUID(),
      positionIndex: i,
      guestId: guestIds[i],
    }));

  const tables = [
    {
      id: randomUUID(),
      name: "Table 1 — Sweetheart",
      shape: "round" as const,
      capacity: 2,
      x: 100,
      y: 100,
      guestIds: confirmedIds.slice(0, 2),
    },
    {
      id: randomUUID(),
      name: "Table 2 — Family",
      shape: "round" as const,
      capacity: 6,
      x: 400,
      y: 100,
      guestIds: confirmedIds.slice(2, 8),
    },
    {
      id: randomUUID(),
      name: "Table 3 — Friends",
      shape: "round" as const,
      capacity: 4,
      x: 700,
      y: 100,
      guestIds: confirmedIds.slice(8, 12),
    },
    {
      id: randomUUID(),
      name: "Table 4 — Coworkers",
      shape: "round" as const,
      capacity: 4,
      x: 400,
      y: 450,
      guestIds: confirmedIds.slice(12, Math.min(16, confirmedIds.length)),
    },
  ];

  await put(
    `${API}/api/weddings/${weddingId}/seating`,
    {
      width: 1200,
      height: 800,
      tables: tables.map((t) => ({
        id: t.id,
        name: t.name,
        shape: t.shape,
        capacity: t.capacity,
        x: t.x,
        y: t.y,
        seats: makeSeats(t.capacity, t.guestIds),
      })),
    },
    cookie,
  );
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

async function capture(
  url: string,
  outFile: string,
  page: import("@playwright/test").Page,
) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  // Give client-side renders time to settle
  await page.waitForTimeout(1500);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await page.screenshot({ path: outFile, fullPage: false });
  console.log(`  saved → ${outFile}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Starting screenshot capture...\n");

  // 1. Create session
  process.stdout.write("Creating demo user... ");
  const { email, cookie } = await createSession();
  console.log(`done (${email})`);

  // 2. Activate billing (local bypass)
  process.stdout.write("Activating Pro subscription via local bypass... ");
  await activateSubscription(email, cookie);
  console.log("done");

  // 3. Seed wedding
  process.stdout.write("Creating wedding... ");
  const wedding = await seedWedding(cookie);
  const weddingId = wedding.id;
  console.log(`done (id: ${weddingId})`);

  // 4. Seed data
  process.stdout.write("Seeding budget... ");
  const categoryIds = await seedBudget(weddingId, cookie);
  console.log("done");

  process.stdout.write("Seeding guests... ");
  const guests = await seedGuests(weddingId, cookie);
  console.log(`done (${guests.length} guests)`);

  process.stdout.write("Seeding vendors... ");
  await seedVendors(weddingId, categoryIds, cookie);
  console.log("done");

  const confirmedGuests = guests.filter((g) => g.rsvpStatus === "accepted");
  process.stdout.write("Seeding seating chart... ");
  await seedSeating(weddingId, confirmedGuests, cookie);
  console.log("done");

  // 5. Launch browser and take screenshots
  console.log("\nCapturing screenshots...");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
    });

    // Inject session cookie
    const { name, value } = parseCookiePair(cookie);
    await context.addCookies([
      {
        name,
        value,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();

    await capture(`${APP}/budget`, path.join(OUT_DIR, "ledger.png"), page);
    await capture(`${APP}/guests`, path.join(OUT_DIR, "guests.png"), page);
    await capture(`${APP}/seating`, path.join(OUT_DIR, "seating.png"), page);
    await capture(`${APP}/vendors`, path.join(OUT_DIR, "vendors.png"), page);
  } finally {
    await browser.close();
  }
  console.log("\nDone.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
