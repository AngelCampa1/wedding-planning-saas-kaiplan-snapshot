import { drizzle } from "drizzle-orm/d1";
import * as schema from "./marketing-schema";

export function createMarketingDb(db: D1Database) {
  return drizzle(db, { schema });
}

export type MarketingDatabase = ReturnType<typeof createMarketingDb>;
