import { z } from "zod";

// The protocol check covers uppercase schemes (e.g. "HTTPS://example.com")
// which startsWith("https://") missed. The try/catch guards against
// environments where z.string().url() passes but new URL(v) still throws
// (e.g. when Zod runs refine callbacks even after earlier validator failures).
export const httpsUrlField = z
  .string()
  .url()
  .refine(
    (v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Must be an https:// URL" },
  );
