import type { FullConfig } from "@playwright/test";
import { prepareLocalE2E } from "../scripts/prepare-local-e2e";

export default async function globalSetup(_: FullConfig) {
  await prepareLocalE2E();
}
