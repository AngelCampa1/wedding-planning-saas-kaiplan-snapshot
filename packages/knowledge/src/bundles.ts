import {
  appHelpSurfaces,
  helpControls,
  helpTopics,
  tourDefinitions,
} from "./app";
import {
  kaiplanPricingFacts,
  billingCopy,
  leadMagnetKnowledge,
  marketingCaptureDefaults,
  marketingCompetitors,
  marketingCtas,
  marketingEmailCopy,
  marketingFaqs,
  marketingProductFacts,
  nurtureSequences,
  productIdentity,
  publicSiteCopy,
  publicFeatureLabels,
  publicPlanFeatures,
  publicPlanLabels,
  unsubscribeCopy,
} from "./marketing";
import { kaiplanOffering } from "./offering";

export const marketingKnowledgeBundle = {
  domain: "marketing",
  audience: "public",
  consumers: [
    "marketing-pages",
    "marketing-email",
    "marketing-infra",
    "marketing-automation",
  ],
  identity: productIdentity,
  siteCopy: publicSiteCopy,
  productFacts: marketingProductFacts,
  pricing: kaiplanPricingFacts,
  planLabels: publicPlanLabels,
  planFeatures: publicPlanFeatures,
  featureLabels: publicFeatureLabels,
  billingCopy,
  competitors: marketingCompetitors,
  leadMagnets: leadMagnetKnowledge,
  nurtureSequences,
  captureDefaults: marketingCaptureDefaults,
  emailCopy: marketingEmailCopy,
  unsubscribeCopy,
  faqs: marketingFaqs,
  ctas: marketingCtas,
  offering: kaiplanOffering,
} as const;

export const appHelpKnowledgeBundle = {
  domain: "app",
  audience: "authenticated",
  consumers: ["app-help", "app-support"],
  surfaces: appHelpSurfaces,
  helpControls,
  helpTopics,
  tourDefinitions,
} as const;
