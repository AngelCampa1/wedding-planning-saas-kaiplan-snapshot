import { z } from "zod";

export const submitFeedbackSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(5000),
  email: z.preprocess(
    (val) => {
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().email().optional(),
  ),
  pageUrl: z.preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z.string().url().optional(),
  ),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
