import { prepareLocalE2E } from "./prepare-local-e2e";

await prepareLocalE2E();
await import("./serve-local-api");
