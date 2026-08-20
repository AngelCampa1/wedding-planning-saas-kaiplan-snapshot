import { leadMagnetKnowledge } from "@kaiplan/knowledge/marketing";

export type LeadMagnetMetadata = {
  title: string;
  description: string;
  path: string;
  nurtureSequenceId: string;
};

export const leadMagnetMetadata: Record<string, LeadMagnetMetadata> =
  Object.fromEntries(
    leadMagnetKnowledge.map((leadMagnet) => [
      leadMagnet.slug,
      {
        title: leadMagnet.title,
        description: leadMagnet.description,
        path: leadMagnet.publicPath,
        nurtureSequenceId: leadMagnet.nurtureSequenceId,
      },
    ]),
  );
