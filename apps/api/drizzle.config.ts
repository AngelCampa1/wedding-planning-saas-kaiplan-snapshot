import { defineConfig } from "drizzle-kit";
import { loadApiDatabaseEnv } from "./scripts/database-env";

loadApiDatabaseEnv({
  requireExplicitDatabaseUrl:
    process.env.KAIPLAN_REQUIRE_EXPLICIT_DATABASE_URL === "true",
});

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
