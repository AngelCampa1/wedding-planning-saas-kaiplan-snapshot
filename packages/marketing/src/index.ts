export type {
  SiteConfig,
  SiteAuthor,
  FaqItem,
  Competitor,
  SurveyQuestion,
  SurveyQualificationConfig,
  SurveyQualificationRule,
  FunnelStage,
  BuyerStage,
  CtaMode,
  SchemaType,
  NavItem,
  FooterLinkGroup,
  FooterConfig,
  ContentItem,
  RelatedPage,
  CategorySummary,
  FilterDef,
  SortOption,
  BreadcrumbItem,
  TrustSignal,
  VisualProofConfig,
  ReferralReward,
  ReferralConfig,
  ProblemAgitationConfig,
  PricingTier,
  TrustSignalCategory,
  CtaCopyBlock,
  HomepageProofCard,
  HomepageProofStack,
  HomepageCopy,
} from "./types";
export { cn } from "./lib/utils";
export {
  CheckIcon,
  CheckIconHidden,
  CrossIcon,
  CrossIconHidden,
  ChevronRightIcon,
  PlusIcon,
  MinusIcon,
} from "./lib/icons";
export { pageUrl, getPageNumbers } from "./lib/pagination";
export { toEmbedUrl } from "./lib/video";
export {
  STAGE_BADGES,
  formatContentDate,
  filterMetadata,
} from "./lib/content-helpers";
export type { StageBadge } from "./lib/content-helpers";
export { CATEGORY_STYLES, CATEGORY_ICONS } from "./lib/trust-signal-styles";
export type { CategoryStyle } from "./lib/trust-signal-styles";
export {
  resolveOgImage,
  ensureTrailingSlash,
  resolveLandingTitle,
  truncateMetaDescription,
} from "./lib/meta";
export { filterTocHeadings, shouldShowToc } from "./lib/headings";
export type { TocHeading } from "./lib/headings";
export {
  getCurrentYear,
  formatArticleDate,
  normalizeDateInput,
} from "./lib/dates";
export {
  buildGoogleFontsUrl,
  buildFontCssOverrides,
  DEFAULT_FONTS,
} from "./lib/fonts";
export {
  sortByUpdatedAtDesc,
  mapToContentItems,
  resolveCanonicalUrl,
  sumCategoryCounts,
  formatNumber,
} from "./lib/collections";
export { EmailCapture } from "./components/email-capture";
export { PostSignupSurvey } from "./components/post-signup-survey";
export { FakeDoorPricing } from "./components/fake-door-pricing";
export { FilterChips } from "./components/filter-chips";
export { SearchOverlay } from "./components/search-overlay";
export { ReferralShare } from "./components/referral-share";
export type {
  LeadMagnet,
  ExitPopupConfig,
  ExitPopupCopy,
  PersonaDefinition,
} from "./types";
export { lockScroll, unlockScroll } from "./lib/scroll-lock";
export { buildFooterEmailCaptureProps } from "./lib/footer-utils";
export type { FooterEmailCaptureProps } from "./lib/footer-utils";
export { buildSidebarCtaProps } from "./lib/sidebar-cta-utils";
export type { SidebarCtaProps } from "./lib/sidebar-cta-utils";
export { resolveFaqHeading } from "./lib/faq-utils";
export { resolveInlineSignupKicker } from "./lib/inline-signup-utils";
export { initMobileNav } from "./lib/mobile-nav";
export {
  trackEvent,
  identifyUser,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from "./lib/analytics";
export type { PostHogInstance } from "./lib/analytics";
export { phasePageSchema, goalPageSchema } from "./content/schemas";
export type { PhasePageEntry, GoalPageEntry } from "./content/schemas";
export { buildGraph, withId, refId } from "./lib/schema-graph";
export { buildSiteIdentitySchemas } from "./lib/site-identity-schemas";
export type {
  SiteIdentitySchemas,
  SiteIdentitySchemasInput,
} from "./lib/site-identity-schemas";
export { createSitemapSerializer } from "./lib/sitemap-utils";
