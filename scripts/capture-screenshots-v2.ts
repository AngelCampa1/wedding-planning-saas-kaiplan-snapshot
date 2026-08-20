/**
 * Editorial screenshot harvest for the Wave 1 marketing overhaul.
 *
 * Captures editorial-aspect-ratio (16:10 landscape and 3:4 portrait) PNGs
 * from the running Kaiplan SPA and public Astro site, at 2× device pixel
 * ratio plus a 1× thumbnail, and writes them under
 * `apps/web/src/assets/screenshots/v2/`.
 *
 * Requires the local e2e stack to already be running:
 *   - Docker Postgres at 55432 (kaiplan-e2e-db)
 *   - Local API at 5030 (scripts/serve-local-api.ts)
 *   - Local App (SPA) at 3030 (apps/app vite)
 *   - Local Web (Astro) at 3031 (apps/web)
 *
 * Usage:
 *   pnpm exec tsx scripts/capture-screenshots-v2.ts
 */

import { chromium, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { readLocalE2ERuntime } from "./local-e2e-config";
import { completeLocalCheckoutWithCookie } from "./local-e2e-billing";
import { parseCookiePair } from "./capture-screenshots";

const runtime = readLocalE2ERuntime();
const API = runtime.urls.api;
const APP = runtime.urls.app;
const WEB = runtime.urls.web;

const OUT_DIR = path.join(process.cwd(), "apps/web/src/assets/screenshots/v2");

// ---------------------------------------------------------------------------
// HTTP helpers
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
// Auth + billing
// ---------------------------------------------------------------------------

async function createSession() {
  const email = `screenshots-v2-${randomUUID()}@example.com`;
  const password = "supersecret123";

  const signupRes = await fetch(`${API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: API },
    body: JSON.stringify({
      name: "Sam Rivera",
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

async function activateSubscription(_email: string, cookie: string) {
  await completeLocalCheckoutWithCookie({
    apiUrl: API,
    appUrl: APP,
    cookie,
    plan: "pro",
  });
}

// ---------------------------------------------------------------------------
// Seed wedding + data
// ---------------------------------------------------------------------------

async function seedWedding(cookie: string) {
  return post(
    `${API}/api/weddings`,
    {
      name: "Sam & Jordan",
      date: "2027-05-22",
      budgetCents: 3500000,
      currency: "USD",
      timezone: "America/New_York",
    },
    cookie,
  ) as Promise<{ id: string }>;
}

async function seedBudget(weddingId: string, cookie: string) {
  const venue = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    { name: "Venue", estimatedCents: 1400000 },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${venue.id}/items`,
    {
      name: "The Hawthorne — site fee",
      estimatedCents: 1400000,
      quotedCents: 1380000,
      paidCents: 690000,
      notes: "50% deposit cleared. Balance due Apr 22.",
    },
    cookie,
  );

  const photo = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    { name: "Photography", estimatedCents: 480000 },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${photo.id}/items`,
    {
      name: "Photographer balance due",
      estimatedCents: 480000,
      quotedCents: 460000,
      paidCents: 230000,
      notes: "Second payment due 14 days before.",
    },
    cookie,
  );

  const catering = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    { name: "Catering", estimatedCents: 920000 },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${catering.id}/items`,
    {
      name: "Catering — 50% paid",
      estimatedCents: 760000,
      quotedCents: 780000,
      paidCents: 390000,
      notes: "Final headcount due 3 weeks out.",
    },
    cookie,
  );
  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${catering.id}/items`,
    {
      name: "Bar service — 5 hour pour",
      estimatedCents: 160000,
      quotedCents: 152000,
      paidCents: 0,
    },
    cookie,
  );

  const florals = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    { name: "Florals", estimatedCents: 320000 },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${florals.id}/items`,
    {
      name: "Florist deposit",
      estimatedCents: 320000,
      quotedCents: 305000,
      paidCents: 100000,
      notes: "Remaining balance due 30 days out.",
    },
    cookie,
  );

  const music = (await post(
    `${API}/api/weddings/${weddingId}/budget/categories`,
    { name: "Music", estimatedCents: 220000 },
    cookie,
  )) as { id: string };

  await post(
    `${API}/api/weddings/${weddingId}/budget/categories/${music.id}/items`,
    {
      name: "DJ + ceremony strings",
      estimatedCents: 220000,
      quotedCents: 215000,
      paidCents: 0,
      notes: "Quote returned. Awaiting decision.",
    },
    cookie,
  );

  return {
    venueId: venue.id,
    photoId: photo.id,
    cateringId: catering.id,
    floralsId: florals.id,
    musicId: music.id,
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
      dietaryNotes: "Vegetarian",
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
      dietaryNotes: "Gluten-free",
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
      dietaryNotes: "Pescatarian",
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
      dietaryNotes: "Vegan",
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
      dietaryNotes: "No nuts",
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
    {
      firstName: "Theo",
      lastName: "Lambert",
      rsvpStatus: "invited",
      side: "partner2",
      groupName: "Family",
    },
    {
      firstName: "Mira",
      lastName: "Saito",
      rsvpStatus: "declined",
      side: "partner1",
      groupName: "Coworkers",
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
    musicId: string;
  },
  cookie: string,
) {
  const vendors = [
    {
      companyName: "The Hawthorne",
      categoryId: categoryIds.venueId,
      contractStatus: "signed",
      primaryContactName: "Maria Santos",
      email: "maria@hawthorne.example",
      phone: "555-0101",
      notes: "Site visit booked for Mar 14.",
    },
    {
      companyName: "Aperture Studios",
      categoryId: categoryIds.photoId,
      contractStatus: "signed",
      primaryContactName: "James Lau",
      email: "james@aperture.example",
      phone: "555-0202",
      notes: "8-hour coverage + second shooter.",
    },
    {
      companyName: "Harvest Table",
      categoryId: categoryIds.cateringId,
      contractStatus: "sent",
      primaryContactName: "Claire Dubois",
      email: "claire@harvesttable.example",
      phone: "555-0303",
      notes: "Awaiting countersignature.",
    },
    {
      companyName: "Bloom & Branch",
      categoryId: categoryIds.floralsId,
      contractStatus: "none",
      primaryContactName: "Anika Johansson",
      email: "anika@bloomfloral.example",
      notes: "Prefer seasonal stems. Quote requested.",
    },
    {
      companyName: "North Loop DJs",
      categoryId: categoryIds.musicId,
      contractStatus: "none",
      primaryContactName: "Rafael Cruz",
      email: "rafael@northloop.example",
      notes: "First contact made. Quote pending.",
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

  // 8 tables arranged across the canvas in a clear grid pattern.
  const tables = [
    {
      name: "Sweetheart",
      shape: "round" as const,
      capacity: 2,
      x: 540,
      y: 80,
      guestIds: confirmedIds.slice(0, 2),
    },
    {
      name: "Family A",
      shape: "round" as const,
      capacity: 6,
      x: 120,
      y: 260,
      guestIds: confirmedIds.slice(2, 8),
    },
    {
      name: "Family B",
      shape: "round" as const,
      capacity: 4,
      x: 420,
      y: 260,
      guestIds: confirmedIds.slice(8, 12),
    },
    {
      name: "Friends 01",
      shape: "round" as const,
      capacity: 6,
      x: 720,
      y: 260,
      guestIds: confirmedIds.slice(12, 18),
    },
    {
      name: "Friends 02",
      shape: "round" as const,
      capacity: 4,
      x: 980,
      y: 260,
      guestIds: [],
    },
    {
      name: "Coworkers",
      shape: "round" as const,
      capacity: 6,
      x: 220,
      y: 540,
      guestIds: [],
    },
    {
      name: "Plus-ones",
      shape: "round" as const,
      capacity: 4,
      x: 540,
      y: 540,
      guestIds: [],
    },
    {
      name: "Kids",
      shape: "round" as const,
      capacity: 4,
      x: 840,
      y: 540,
      guestIds: [],
    },
  ];

  await put(
    `${API}/api/weddings/${weddingId}/seating`,
    {
      width: 1200,
      height: 800,
      tables: tables.map((t) => ({
        id: randomUUID(),
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

async function patch(url: string, body: unknown, cookie: string) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: APP,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${url} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function get(url: string, cookie: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { Cookie: cookie, Origin: APP },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function markChecklistMix(weddingId: string, cookie: string) {
  // The SPA seeds the template tasks lazily on first visit; call the API
  // explicitly so we get a populated checklist for the screenshot.
  await post(`${API}/api/weddings/${weddingId}/checklist/seed`, {}, cookie);
  const data = (await get(
    `${API}/api/weddings/${weddingId}/checklist`,
    cookie,
  )) as {
    tasks: {
      id: string;
      bucket: string;
      title: string;
      completedAt: string | null;
    }[];
  };
  const tasks = data.tasks ?? [];

  // Mark a mix complete: every other task in the earliest two buckets,
  // plus a sprinkle in later buckets — gives the visual texture of real
  // progress spanning months.
  const completeAt = new Date().toISOString();
  const earlyBuckets = new Set(["12mo_plus", "9_to_12mo"]);
  let toComplete = 0;
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    const inEarly = earlyBuckets.has(t.bucket);
    const shouldComplete = inEarly ? i % 2 === 0 : i % 9 === 0;
    if (!shouldComplete) continue;
    await patch(
      `${API}/api/weddings/${weddingId}/checklist/${t.id}`,
      { completedAt: completeAt },
      cookie,
    );
    toComplete += 1;
  }
  return toComplete;
}

async function seedAndPublishWebsite(weddingId: string, cookie: string) {
  const slug = `sam-and-jordan-${randomUUID().slice(0, 8)}`;
  const draft = {
    weddingId,
    slug,
    template: "classic" as const,
    content: {
      hero: {
        title: "Sam & Jordan",
        subtitle: "May 22, 2027 — Hudson Valley, New York",
        body: "We can't wait to celebrate with the people who got us here. Save the date and RSVP below.",
        ctaLabel: "RSVP",
      },
      story: {
        title: "Our story",
        body: "We met in a coffee shop in Brooklyn during a power outage and never quite recovered. Five years later we're getting married in the same county where we hiked our first trail together. We hope the day feels as warm as those years have.",
      },
      venue: {
        name: "The Hawthorne",
        address: "112 Maple Lane, Hudson, NY",
        details:
          "Ceremony at 4:30pm under the elm. Cocktails on the terrace. Dinner inside the barn.",
        mapUrl: null,
      },
      registry: {
        title: "Registry",
        url: null,
        details:
          "Your presence is gift enough. If you'd like to send something, our registry lives at zola.com/sam-and-jordan.",
      },
      rsvp: {
        visible: true,
        headline: "RSVP by April 1, 2027",
        details:
          "Tap below to find your name and let us know if you can make it. Plus-ones welcome where listed.",
      },
      heroImage: null,
    },
  };

  // Create draft (POST)
  await post(`${API}/api/weddings/${weddingId}/website`, draft, cookie);
  // Publish
  await post(`${API}/api/weddings/${weddingId}/website/publish`, {}, cookie);
  return slug;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

type Capture = {
  key: string;
  url: string;
  /** "landscape" = 16:10, "portrait" = 3:4 */
  orientation: "landscape" | "portrait";
  /** Optional pre-screenshot wait selector. */
  waitForSelector?: string;
  /**
   * Optional hook run after the page settles but before the screenshot.
   * Used to put the UI into a transient state that a plain navigation
   * cannot reach — e.g. holding a drag mid-flight.
   */
  beforeShot?: (page: Page) => Promise<void>;
};

const LANDSCAPE = { width: 1440, height: 900 };
const PORTRAIT = { width: 900, height: 1200 };

/**
 * Picks up an unseated guest chip and holds it over the seating canvas
 * without releasing, so the screenshot shows the drag overlay, the lifted
 * chip, and the highlighted drop target all at once.
 *
 * dnd-kit's PointerSensor needs a small initial movement before it starts a
 * drag, hence the nudge before the travel move.
 */
async function holdGuestMidDrag(page: Page) {
  const canvas = page.locator('[aria-label="Seating chart canvas"]');
  const chip = page
    .locator('[aria-label="Filter unseated guests by RSVP"]')
    .locator("xpath=../..")
    .locator("button")
    .first();

  const from = await chip.boundingBox();
  const to = await canvas.boundingBox();
  if (!from || !to) {
    throw new Error("could not resolve drag source or target");
  }

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Clear dnd-kit's activation constraint.
  await page.mouse.move(startX + 12, startY + 12, { steps: 4 });
  // Travel to the upper-left quadrant of the canvas, where the first tables sit.
  await page.mouse.move(to.x + to.width * 0.32, to.y + to.height * 0.34, {
    steps: 24,
  });
  // Let the overlay and drop highlight paint. No mouse.up — the drag is held.
  await page.waitForTimeout(600);
}

async function captureOne(
  page: Page,
  capture: Capture,
  outDir: string,
  variant: "@2x" | "@1x",
) {
  const viewport = capture.orientation === "landscape" ? LANDSCAPE : PORTRAIT;
  await page.setViewportSize(viewport);
  await page.goto(capture.url, {
    waitUntil: "networkidle",
    timeout: 45_000,
  });

  if (capture.waitForSelector) {
    try {
      await page.waitForSelector(capture.waitForSelector, { timeout: 10_000 });
    } catch {
      // Continue even if selector not found — capture what we have.
    }
  }
  // Settle animations and any client-side rendering.
  await page.waitForTimeout(2000);

  if (capture.beforeShot) {
    try {
      await capture.beforeShot(page);
    } catch (error) {
      console.warn(`  ${capture.key}: beforeShot failed — ${String(error)}`);
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const fileName =
    variant === "@2x" ? `${capture.key}@2x.png` : `${capture.key}.png`;
  const target = path.join(outDir, fileName);
  await page.screenshot({ path: target, fullPage: false });

  if (capture.beforeShot) {
    // beforeShot may leave a pointer held down (see holdGuestMidDrag).
    // Release it so the state cannot leak into the next capture.
    await page.mouse.up().catch(() => {});
  }

  const stat = fs.statSync(target);
  console.log(
    `  ${capture.key} ${variant}: ${(stat.size / 1024).toFixed(1)}KB → ${path.basename(target)}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Editorial screenshot harvest — v2\n");

  process.stdout.write("Creating demo user... ");
  const { email, cookie } = await createSession();
  console.log(`done (${email})`);

  process.stdout.write("Activating Pro subscription via local bypass... ");
  await activateSubscription(email, cookie);
  console.log("done");

  process.stdout.write("Creating wedding... ");
  const wedding = await seedWedding(cookie);
  const weddingId = wedding.id;
  console.log(`done (id: ${weddingId})`);

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

  process.stdout.write("Marking some checklist tasks complete... ");
  const completedCount = await markChecklistMix(weddingId, cookie);
  console.log(`done (${completedCount} marked)`);

  process.stdout.write("Publishing wedding website... ");
  const websiteSlug = await seedAndPublishWebsite(weddingId, cookie);
  console.log(`done (/${websiteSlug})`);

  console.log("\nCapturing screenshots...");
  const captures: Capture[] = [
    {
      key: "budget-ledger",
      url: `${APP}/budget`,
      orientation: "landscape",
      waitForSelector: "main",
    },
    {
      key: "guest-list",
      url: `${APP}/guests`,
      orientation: "landscape",
      waitForSelector: "main",
    },
    {
      key: "seating-chart",
      url: `${APP}/seating`,
      orientation: "landscape",
      waitForSelector: "main",
    },
    {
      key: "vendor-tracker",
      url: `${APP}/vendors`,
      orientation: "landscape",
      waitForSelector: "main",
    },
    {
      key: "wedding-website",
      url: `${WEB}/w/${websiteSlug}/`,
      orientation: "portrait",
      waitForSelector: "main",
    },
    {
      key: "milestone-checklist",
      url: `${APP}/checklist`,
      orientation: "portrait",
      waitForSelector: "main",
    },
    {
      key: "dashboard",
      url: `${APP}/dashboard`,
      orientation: "landscape",
      waitForSelector: "main",
    },
    {
      key: "seating-drag",
      url: `${APP}/seating`,
      orientation: "landscape",
      waitForSelector: '[aria-label="Seating chart canvas"]',
      beforeShot: holdGuestMidDrag,
    },
  ];

  const browser = await chromium.launch({ headless: true });
  try {
    const { name, value } = parseCookiePair(cookie);
    const cookies = [
      {
        name,
        value,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
      },
    ];

    async function withContext(
      dpr: number,
      run: (page: Page, ctx: BrowserContext) => Promise<void>,
    ) {
      const context = await browser.newContext({
        viewport: LANDSCAPE,
        deviceScaleFactor: dpr,
      });
      await context.addCookies(cookies);
      const page = await context.newPage();
      try {
        await run(page, context);
      } finally {
        await context.close();
      }
    }

    // 2x captures (full retina).
    console.log("\n→ 2× captures");
    await withContext(2, async (page) => {
      for (const c of captures) {
        await captureOne(page, c, OUT_DIR, "@2x");
      }
    });

    // 1x captures (smaller thumbnail).
    console.log("\n→ 1× thumbnails");
    await withContext(1, async (page) => {
      for (const c of captures) {
        await captureOne(page, c, OUT_DIR, "@1x");
      }
    });
  } finally {
    await browser.close();
  }

  console.log("\nDone.");
  console.log(`Output: ${OUT_DIR}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
