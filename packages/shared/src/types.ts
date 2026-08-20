import type {
  BillingFeature,
  BillingPlan,
  BillingStatus,
  EmailDeliveryStatus,
  EmailPreferenceType,
  WeddingRole,
  GuestSide,
  RsvpStatus,
  DietaryTag,
  SeatingTableShape,
  VendorContractStatus,
  VendorQuoteStatus,
  VendorPaymentType,
  WeddingWebsiteTemplate,
} from "./constants";
export type { SeatingTableShape } from "./constants";

export type WeddingStatus = "planning" | "archived";

export interface Wedding {
  id: string;
  name: string;
  date: string | null;
  budgetCents: number;
  currency: string;
  timezone: string;
  createdBy: string;
  archivedAt: string | null;
  status: WeddingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WeddingMember {
  id: string;
  weddingId: string;
  userId: string | null;
  role: WeddingRole;
  invitedEmail: string | null;
  acceptedAt: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

export interface InviteMemberDeliveryMetadata {
  emailId: string | null;
  provider: "resend";
  status: EmailDeliveryStatus;
  sentAt: string | null;
  templateKey: string;
  skipped: boolean;
  rateLimited: boolean;
  error: string | null;
}

export interface WeddingMemberInviteResponse extends WeddingMember {
  delivery: InviteMemberDeliveryMetadata;
}

export interface EmailPreferences {
  appLifecycle: boolean;
  memberInvite: boolean;
  rsvpConfirmation: boolean;
  rsvpReminder: boolean;
}

export interface EmailPreferencesResponse {
  email: string;
  preferences: EmailPreferences;
}

export interface PublicEmailPreferencesResponse {
  email: string;
  allowedTypes: EmailPreferenceType[];
  preferences: EmailPreferences;
}

export interface UpdateEmailPreferencesInput {
  preferences: EmailPreferences;
}

export interface ManualRsvpReminderRequest {
  primaryGuestIds: string[];
}

export type ManualRsvpReminderResultStatus =
  | "sent"
  | "skippedOptedOut"
  | "skippedMissingEmail"
  | "skippedIneligible"
  | "skippedNoWebsite"
  | "failed";

export interface ManualRsvpReminderResult {
  primaryGuestId: string;
  guestEmail: string | null;
  status: ManualRsvpReminderResultStatus;
  emailId: string | null;
  error: string | null;
}

export interface ManualRsvpReminderResponse {
  results: ManualRsvpReminderResult[];
}

export interface WeddingWithRole extends Wedding {
  role: WeddingRole;
}

export interface Subscription {
  userId: string;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  plan: BillingPlan;
  status: BillingStatus;
  currentPeriodEnd: string | null;
  billingGateRequiredAt: string | null;
  trialStartedAt: string | null;
  trialEndingReminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingSummary {
  plan: BillingPlan;
  status: BillingStatus;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  billingGateRequired: boolean;
  features: BillingFeature[];
  canManageBilling: boolean;
  trialDaysRemaining: number | null;
  featuresUsed: BillingFeature[];
}

export interface BillingHistoryItem {
  id: string;
  type: "invoice" | "payment_intent";
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
  hostedUrl: string | null;
}

export interface BillingHistoryResponse {
  items: BillingHistoryItem[];
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface WeddingWebsiteHeroImage {
  imageId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
  mimeType?: string;
}

export interface WeddingWebsiteContentSection {
  title: string;
  body: string;
}

export interface WeddingWebsiteContent {
  hero: {
    title: string;
    subtitle: string;
    body: string;
    ctaLabel: string;
  };
  story: WeddingWebsiteContentSection;
  venue: {
    name: string;
    address: string;
    details: string;
    mapUrl?: string | null;
  };
  registry: {
    title: string;
    url?: string | null;
    details: string;
  };
  rsvp: {
    visible: boolean;
    headline: string;
    details: string;
  };
  heroImage: WeddingWebsiteHeroImage | null;
}

export interface WeddingWebsiteDraft {
  weddingId: string;
  slug: string;
  template: WeddingWebsiteTemplate;
  content: WeddingWebsiteContent;
  publishedSlug?: string | null;
  publishedAt?: string | null;
}

export interface WeddingWebsitePublishedSnapshot extends WeddingWebsiteDraft {
  publishedAt: string;
}

export interface WeddingWebsitePublicResponse {
  weddingId: string;
  slug: string;
  template: WeddingWebsiteTemplate;
  publishedAt: string;
  content: WeddingWebsiteContent;
}

export interface HouseholdRsvpToken {
  token: string;
  weddingId: string;
  primaryGuestId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeddingWebsiteSlugAvailability {
  slug: string;
  valid: boolean;
  available: boolean;
  conflictWeddingId: string | null;
}

export interface WeddingWebsiteImageUploadIntent {
  imageId: string;
  uploadUrl: string;
  imageUrl: string;
  expiresAt: string;
}

export interface HouseholdRsvpSubmissionItem {
  guestId: string;
  rsvpStatus: RsvpStatus;
}

export interface HouseholdRsvpSubmission {
  guests: HouseholdRsvpSubmissionItem[];
  honeypot: string;
  turnstileToken?: string | null;
}

export interface BudgetCategory {
  id: string;
  weddingId: string;
  name: string;
  estimatedCents: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetItem {
  id: string;
  categoryId: string;
  name: string;
  estimatedCents: number;
  quotedCents: number;
  paidCents: number;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCategoryWithTotals extends BudgetCategory {
  totalItemEstimatedCents: number;
  totalQuotedCents: number;
  totalPaidCents: number;
  itemCount: number;
}

export interface BudgetSummary {
  totalBudgetCents: number;
  totalEstimatedCents: number;
  totalQuotedCents: number;
  totalPaidCents: number;
  unallocatedCents: number;
  categories: BudgetCategoryWithTotals[];
}

export interface Vendor {
  id: string;
  weddingId: string;
  categoryId: string;
  primaryContactName: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  contractStatus: VendorContractStatus;
  contractUrl: string | null;
  contractSentAt: string | null;
  contractSignedAt: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface VendorQuote {
  id: string;
  vendorId: string;
  amountCents: number;
  quotedAt: string;
  status: VendorQuoteStatus;
  budgetItemId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorPayment {
  id: string;
  quoteId: string;
  paymentType: VendorPaymentType;
  amountCents: number;
  paidAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorQuoteWithPayments extends VendorQuote {
  payments: VendorPayment[];
}

export interface VendorListItem extends Vendor {
  categoryName: string;
  activeQuoteId: string | null;
  activeQuoteAmountCents: number | null;
  totalPaidCents: number;
  outstandingCents: number;
  quoteCount: number;
}

export interface VendorDetail extends Vendor {
  categoryName: string;
  quotes: VendorQuoteWithPayments[];
}

export interface VendorSummary {
  totalVendors: number;
  pendingQuotes: number;
  signedContracts: number;
  totalPaidCents: number;
  totalOutstandingCents: number;
}

export interface Guest {
  id: string;
  weddingId: string;
  primaryGuestId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  side: GuestSide;
  groupName: string | null;
  dietaryTags: DietaryTag[];
  dietaryNotes: string | null;
  rsvpStatus: RsvpStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuestWithPlusOnes extends Guest {
  plusOnes: Guest[];
}

export interface HouseholdRsvpGuest {
  id: string;
  firstName: string;
  lastName: string;
  rsvpStatus: RsvpStatus;
}

export interface HouseholdRsvpResponse {
  token: string;
  primaryGuest: HouseholdRsvpGuest;
  guests: HouseholdRsvpGuest[];
}

export interface GuestSummary {
  totalGuests: number;
  totalPrimary: number;
  totalPlusOnes: number;
  byRsvp: Record<RsvpStatus, number>;
  byDietary: Record<DietaryTag, number>;
  bySide: Record<GuestSide, number>;
}

export interface SeatingSeat {
  id: string;
  positionIndex: number;
  guestId?: string;
}

interface SeatingTableBase {
  id: string;
  name: string;
  shape: SeatingTableShape;
  capacity: number;
  x: number;
  y: number;
  seats: SeatingSeat[];
}

interface SeatingRoundTable extends SeatingTableBase {
  shape: "round";
  orientation?: never;
}

interface SeatingRectangleTable extends SeatingTableBase {
  shape: "rectangle";
  orientation?: "horizontal" | "vertical";
}

export type SeatingTable = SeatingRoundTable | SeatingRectangleTable;

export interface SeatingChart {
  width: number;
  height: number;
  tables: SeatingTable[];
}

export interface SeatingSummary {
  tableCount: number;
  seatCount: number;
  assignedSeatCount: number;
  unassignedSeatCount: number;
}

export interface GetSeatingResponse {
  chart: SeatingChart;
  summary: SeatingSummary;
}
