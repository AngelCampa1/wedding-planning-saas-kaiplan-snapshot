import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { wedding } from "./schema";
import { guest } from "./guest-schema";
import type {
  WeddingWebsiteContent,
  WeddingWebsiteTemplate,
} from "@kaiplan/shared";

export const weddingWebsite = pgTable(
  "wedding_website",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    template: text("template").notNull().$type<WeddingWebsiteTemplate>(),
    draftContent: jsonb("draft_content")
      .notNull()
      .$type<WeddingWebsiteContent>(),
    publishedSlug: text("published_slug"),
    publishedTemplate:
      text("published_template").$type<WeddingWebsiteTemplate>(),
    publishedContent: jsonb("published_content")
      .$type<WeddingWebsiteContent | null>()
      .default(null),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("wedding_website_wedding_id_unique").on(table.weddingId),
    unique("wedding_website_slug_unique").on(table.slug),
    unique("wedding_website_published_slug_unique").on(table.publishedSlug),
  ],
);

export const householdRsvpToken = pgTable(
  "household_rsvp_token",
  {
    token: uuid("token").defaultRandom().primaryKey(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => wedding.id, { onDelete: "cascade" }),
    primaryGuestId: uuid("primary_guest_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("household_rsvp_token_primary_guest_unique").on(
      table.primaryGuestId,
    ),
  ],
);
