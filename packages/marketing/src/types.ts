import type { CategoryStyle } from "./lib/trust-signal-styles";

export interface PersonaDefinition {
  slug: string;
  label: string;
  description: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface Competitor {
  slug: string;
  name: string;
  pricing: string;
  weakness: string;
  setupFee?: string;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface SurveyQualificationRule {
  questionId: string;
  answers: string[];
}

export interface SurveyQualificationConfig {
  logic?: "any" | "all";
  rules: SurveyQualificationRule[];
}

export interface FunnelStage {
  ctaMode: "educate" | "evaluate" | "convert";
  ctaText: string;
  ctaTarget: string;
}

export interface CtaAnalyticsContext {
  pageFamily?: string;
  buyerStage?: BuyerStage;
  placement?: string;
  intent?: string;
  target?: string;
}

export interface CtaLinkConfig {
  text: string;
  target: string;
}

export interface DecisionCtaCardProps {
  heading: string;
  subtext: string;
  bullets?: string[];
  primaryCta: CtaLinkConfig;
  secondaryCta?: CtaLinkConfig;
  analytics?: CtaAnalyticsContext;
}

export interface NavItem {
  label: string;
  href: string;
  megaMenu?: {
    groups: {
      heading: string;
      links: {
        label: string;
        href: string;
        description?: string;
      }[];
    }[];
  };
}

export interface FooterLinkGroup {
  heading: string;
  links: { label: string; href: string }[];
}

export interface FooterBrandMetric {
  value: string;
  label: string;
}

export interface FooterConfig {
  linkGroups: FooterLinkGroup[];
  legalLinks?: { label: string; href: string }[];
  emailCapture?: {
    heading?: string;
    buttonText?: string;
  };
  brandMetrics?: FooterBrandMetric[];
}

export interface SiteAuthor {
  name: string;
  title?: string;
  url?: string;
  jobTitle?: string;
  sameAs?: string[];
  credentials?: string;
}

export interface TrustSignal {
  text: string;
  category: "feature" | "roi" | "compliance" | "integration";
}

export type VisualProofConfig =
  | {
      type: "image";
      src: string;
      alt: string;
      heading?: string;
      caption?: string;
      width?: number;
      height?: number;
    }
  | {
      type: "video";
      src: string;
      alt?: string;
      heading?: string;
      caption?: string;
      width?: number;
      height?: number;
    }
  | {
      type: "embed";
      src: string;
      alt?: string;
      heading?: string;
      caption?: string;
      width?: number;
      height?: number;
    };

export interface ReferralReward {
  threshold: number;
  description: string;
}

export interface ReferralConfig {
  enabled: boolean;
  rewards: ReferralReward[];
}

export interface ProblemAgitationConfig {
  eyebrow?: string;
  heading: string;
  closingLine: string;
  painPoints: string[];
}

/**
 * Content lead magnet offered in the exit-intent popup.
 * `description` is rendered as the popup's body copy (sub-headline).
 * If not provided on a site, the popup falls back to confirmation copy.
 */
export interface LeadMagnet {
  /** Bare noun phrase - do NOT start with "Your" (the email subject prepends it automatically). E.g. "HOA Reserve Fund Checklist" not "Your HOA Reserve Fund Checklist". */
  title: string;
  description: string;
  slug?: string;
  teaser?: string;
  ctaText?: string;
}

/**
 * Controls exit-intent popup behavior at the site level.
 * The popup is enabled by default for all sites.
 * Set `enabled: false` to disable it for a specific site.
 * Note: the popup activates whenever `exitPopup?.enabled !== false`.
 * Copy overrides live in `SiteConfig.copy.exitPopup`.
 */
export interface ExitPopupConfig {
  enabled?: boolean;
}

export interface ExitPopupCopy {
  headline: string;
  description: string;
  ctaText: string;
  leftPanelLabel: string;
  successSubMessage: string;
  /** Defaults to true. Set false to keep popup copy independent from site-level leadMagnet content. */
  showLeadMagnetContent?: boolean;
  declineText?: string;
  privacyNote?: string;
  errorInvalidEmail?: string;
  errorDuplicate?: string;
  errorGeneric?: string;
  successMessage?: string;
  loadingText?: string;
}

export interface CtaCopyBlock {
  heading: string;
  subtext: string;
  appointmentPrepNote?: string;
  buttonText?: string;
}

export interface HomepageProofCard {
  title: string;
  description: string;
}

export interface HomepageProofStack {
  outcome: HomepageProofCard;
  privacy: HomepageProofCard;
  appointmentPrep: HomepageProofCard;
}

export interface HomepageCopy {
  heroCtaText?: string;
  proofHeading?: string;
  proofBody?: string;
  proofStack?: HomepageProofStack;
  proofCards?: HomepageProofCard[];
  pricingHeading?: string;
  pricingBody?: string;
}

export type TrustSignalCategory =
  | "feature"
  | "roi"
  | "compliance"
  | "integration";

export type ThemeSurfaceStyle = "glass" | "flat" | "layered";
export type ThemeMotionIntensity = "none" | "subtle" | "balanced";
export type ThemeCtaStyle = "solid" | "soft" | "outline";
export type ThemeLayoutDensity = "compact" | "comfortable" | "airy";
export type ThemeChromeEmphasis = "subtle" | "balanced" | "strong";

export interface SiteTheme {
  primary: string;
  accent: string;
  surface?: string;
  text?: string;
  muted?: string;
  error?: string;
  success?: string;
  surfaceStyle?: ThemeSurfaceStyle;
  motionIntensity?: ThemeMotionIntensity;
  ctaStyle?: ThemeCtaStyle;
  layoutDensity?: ThemeLayoutDensity;
  chromeEmphasis?: ThemeChromeEmphasis;
  categoryColors?: Partial<Record<TrustSignalCategory, Partial<CategoryStyle>>>;
  dark?: {
    primary?: string;
    accent?: string;
    surface?: string;
    surfaceSecondary?: string;
    text?: string;
    muted?: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono?: string;
  };
}

export interface SiteConfig {
  name: string;
  domain: string;
  tagline: string;
  metaDescription?: string;
  preserveMetaTagCopy?: boolean;
  author?: SiteAuthor;
  /** Organization-level sameAs - social profiles and external mentions */
  sameAs?: string[];
  /** Contact email for Organization schema ContactPoint */
  contactEmail?: string;
  /** Geographic areas served - used in Organization schema */
  areaServed?: string[] | string;
  /** Default og:image path - used when no page-specific og:image is set */
  defaultOgImage?: string;
  /** Optional Apple touch icon path for iOS home screen shortcuts */
  appleTouchIcon?: string;
  /** URL path template for site search - enables WebSite SearchAction schema.
   *  The placeholder `{search_term_string}` must appear literally in the value.
   *  Example: "/search?q={search_term_string}" */
  searchPathTemplate?: string;

  theme: SiteTheme;

  product: {
    category: string;
    price: string;
    setupFee?: string;
    targetAudience: string;
    trustSignals: TrustSignal[];
  };

  comparisonFeatures?: string[];

  competitors: Competitor[];

  funnel: {
    tofu: FunnelStage;
    mofu: FunnelStage;
    bofu: FunnelStage;
    ctaSubtitle: string;
  };

  survey: {
    questions: SurveyQuestion[];
    qualification?: SurveyQualificationConfig;
  };

  faqs: FaqItem[];

  discoveryCallUrl?: string;
  discoveryCallIncentive?: string;

  problemAgitation: ProblemAgitationConfig;

  visualProof?: VisualProofConfig;

  referral: ReferralConfig;

  leadMagnet?: LeadMagnet;
  leadMagnetOptions?: LeadMagnet[];
  exitPopup?: ExitPopupConfig;

  nav?: {
    items: NavItem[];
  };

  footer?: FooterConfig;

  logo?: {
    light: string; // e.g. '/logo-light.svg'
    dark: string; // e.g. '/logo-dark.svg'
  };

  /** Twitter/X handle for the site. Must include the @ prefix, e.g. "@crewrouteapp". */
  social?: {
    twitterHandle?: string;
  };

  copy?: {
    emailCapture?: {
      privacyNote?: string;
      errorInvalidEmail?: string;
      errorDuplicate?: string;
      errorGeneric?: string;
      successMessage?: string;
      surveyPreview?: string;
      subtitle?: string;
      whatHappensNext?: string;
    };
    fakeDoorPricing?: {
      confirmationMessage?: string;
      buttonPrefix?: string;
      popularTier?: string;
      selectedMessages?: Record<string, string>;
    };
    survey?: {
      qualifiedHeading?: string;
      qualifiedBody?: string;
      qualifiedCtaText?: string;
      qualifiedDismissText?: string;
      unqualifiedHeading?: string;
      unqualifiedBody?: string;
      unqualifiedCtaText?: string;
      unqualifiedCtaTarget?: string;
      unqualifiedDismissText?: string;
    };
    funnelCta?: {
      trustNote?: string;
      subtitle?: string;
      benefitBullets?: string[];
      secondaryCta?: {
        text: string;
        target: string;
      };
    };
    inlineSignup?: {
      listicle?: CtaCopyBlock;
      guide?: CtaCopyBlock;
      symptom?: CtaCopyBlock;
      versus?: CtaCopyBlock;
      pricing?: CtaCopyBlock;
      compareHub?: CtaCopyBlock;
      alternativesHub?: CtaCopyBlock;
      statePage?: CtaCopyBlock;
    };
    homepage?: HomepageCopy;
    faq?: {
      bottomCtaHeading?: string;
      bottomCtaText?: string;
      bottomCtaTarget?: string;
    };
    exitPopup?: ExitPopupCopy;
  };

  socialProof?: Array<{ icon?: string; value: string; label: string }>;
  heroBenefits?: string[];
  heroTrustSignal?: string;
  pricingTiers?: PricingTier[];
  pricingConfig?: {
    trialBannerText?: string; // e.g. "1-month free trial on all plans"
    annualSavingsText?: string; // e.g. "2 months free"
    monthlyToggleLabel?: string; // defaults to "Monthly" in component
    annualToggleLabel?: string; // defaults to "Annual" in component
    showBillingToggle?: boolean; // explicit opt-out; auto-detected from tiers by default
  };
  heroCopy?: { subheadline: string };

  /** Analytics configuration. Defaults to enabled for all sites. Set `enabled: false` to opt out. */
  analytics?: {
    enabled?: boolean;
  };
}

export type PricingModel = "flat" | "per-user" | "per-unit" | "one-time";

export interface PricingTier {
  name: string;
  price: string; // monthly display string, e.g. "$49/mo"
  monthlyPriceCents?: number; // e.g. 4900 - enables annual toggle + computed price
  annualPriceCents?: number; // e.g. 20000 - annual total price in cents for toggle display
  annualPriceOverride?: string; // optional custom annual display, e.g. "$24.99/yr"
  pricingModel?: PricingModel; // defaults to "flat" if omitted
  unitLabel?: string; // e.g. "/user", "/child" - appended to computed annual prices
  description?: string;
  features: string[];
  highlighted?: boolean; // true = visually emphasized (border/scale treatment)
  ctaText?: string; // per-tier button text override
}

export type BuyerStage = "tofu" | "mofu" | "bofu";
export type CtaMode = "educate" | "evaluate" | "convert";
export type SchemaType =
  | "Article"
  | "FAQPage"
  | "HowTo"
  | "Product"
  | "ItemList"
  | "BreadcrumbList"
  | "Organization"
  | "SoftwareApplication"
  | "WebSite"
  | "SearchAction";

export interface RelatedPage {
  title: string;
  href: string;
  description?: string;
}

export interface ContentItem {
  title: string;
  description: string;
  href: string;
  buyerStage: BuyerStage;
  publishedAt: string;
  updatedAt: string;
  metadata?: Record<string, string>;
  featured?: boolean;
  relatedPages: RelatedPage[];
  canonical?: string;
  noindex?: boolean;
  targetPersona?: string[];
}

export interface CategorySummary {
  name: string;
  description: string;
  href: string;
  count: number;
}

export interface FilterDef {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface SortOption {
  value: string;
  label: string;
}

export interface BreadcrumbItem {
  label: string;
  href: string;
}
