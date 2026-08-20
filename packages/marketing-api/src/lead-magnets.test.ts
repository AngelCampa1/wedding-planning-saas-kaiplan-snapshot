import { describe, expect, it } from "vitest";
import { leadMagnetKnowledge } from "@kaiplan/knowledge/marketing";
import { leadMagnetMetadata } from "./lead-magnets";

describe("leadMagnetMetadata", () => {
  it("derives public lead magnet metadata from the canonical knowledge bundle", () => {
    expect(leadMagnetMetadata).toEqual(
      Object.fromEntries(
        leadMagnetKnowledge.map((leadMagnet) => [
          leadMagnet.slug,
          {
            title: leadMagnet.title,
            description: leadMagnet.description,
            path: leadMagnet.publicPath,
            nurtureSequenceId: "kaiplan-lead-magnet-nurture",
          },
        ]),
      ),
    );
  });
});
