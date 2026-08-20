import { createSiteWebManifestResponse } from "../../lib/site-webmanifest";

export function GET() {
  return createSiteWebManifestResponse();
}
