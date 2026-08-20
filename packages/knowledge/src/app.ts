export interface HelpControl {
  key: string;
  label: string;
  body: string;
  route: string;
  tooltip: string;
  why: string;
  nextAction: string;
  tone: "info" | "safety" | "next-step";
}

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  route: string;
  steps: string[];
  controls: string[];
}

export interface TourStep {
  title: string;
  body: string;
  route: string;
  targetKey?: string;
}

export interface TourDefinition {
  id: string;
  title: string;
  description: string;
  steps: TourStep[];
}

export const helpControls: HelpControl[] = [
  {
    key: "dashboard-quick-actions",
    label: "Quick actions",
    route: "/dashboard",
    tooltip: "Shortcuts to the planning sections couples usually need first.",
    body: "These shortcuts open the places couples usually need first: guests, website, and seating. They do not delete or publish anything.",
    why: "They help you move without hunting through the sidebar.",
    nextAction: "Choose the task that matches what you want to do now.",
    tone: "next-step",
  },
  {
    key: "dashboard-modules",
    label: "Planning cards",
    route: "/dashboard",
    tooltip: "A status map for the main parts of your wedding plan.",
    body: "Each card is a quiet status check. Open a card when you want to work on that part of the wedding.",
    why: "The dashboard should answer what needs attention without making you inspect every page.",
    nextAction: "Open the card with the Start here label first.",
    tone: "next-step",
  },
  {
    key: "checklist-buckets",
    label: "Checklist sections",
    route: "/checklist",
    tooltip: "Tasks grouped by when they usually happen.",
    body: "Tasks are grouped by timeline. Open the section closest to your wedding date and check off what is already done.",
    why: "Wedding tasks feel easier when they are sorted into time windows.",
    nextAction:
      "Open the nearest timeline section and mark anything already finished.",
    tone: "next-step",
  },
  {
    key: "checklist-add-task",
    label: "Add task",
    route: "/checklist",
    tooltip: "Add a custom task for your specific wedding.",
    body: "Use this when your wedding has a task Kaiplan did not include. Press Enter to save, or Escape to cancel.",
    why: "Every wedding has a few personal details that do not fit a template.",
    nextAction: "Type the task in everyday words, then press Enter.",
    tone: "info",
  },
  {
    key: "budget-summary",
    label: "Budget summary",
    route: "/budget",
    tooltip: "Shows planned, paid, and remaining money.",
    body: "This shows planned, paid, and remaining money. It is a decision aid, not a bill.",
    why: "It helps you spot whether decisions are still inside the budget before money is spent.",
    nextAction:
      "Start with the biggest known cost, even if the number is approximate.",
    tone: "info",
  },
  {
    key: "budget-add-category",
    label: "Budget categories",
    route: "/budget",
    tooltip: "Groups costs like venue, food, music, or photos.",
    body: "Start with the biggest known cost, like venue or catering. You can add the small details later.",
    why: "Broad groups keep the budget readable before every tiny line item is known.",
    nextAction: "Create one category for a cost you already know.",
    tone: "next-step",
  },
  {
    key: "budget-category-panel",
    label: "Category details",
    route: "/budget",
    tooltip: "Add individual costs, payments, and notes inside a category.",
    body: "Open a category to add line items, payments, and notes for the costs inside it.",
    why: "Deposits and balances are easier to trust when they live with the category.",
    nextAction: "Add a line item for the next quote, deposit, or payment.",
    tone: "info",
  },
  {
    key: "guests-add",
    label: "Add guest",
    route: "/guests",
    tooltip: "Add one person or household at a time.",
    body: "Add one household or person at a time. Plus-ones can stay connected to the primary guest.",
    why: "Keeping households together makes RSVPs, seating, and invite links easier later.",
    nextAction: "Add the main guest first, then add their plus-one if needed.",
    tone: "next-step",
  },
  {
    key: "guests-import",
    label: "Import CSV",
    route: "/guests",
    tooltip: "Bring in guests from a spreadsheet file.",
    body: "CSV means a spreadsheet saved as plain rows and columns. Use it when you already have a guest list in Excel, Google Sheets, or Numbers.",
    why: "Importing saves typing when your guest list already exists in a spreadsheet.",
    nextAction:
      "Download or save your spreadsheet as CSV, then import it here.",
    tone: "info",
  },
  {
    key: "guests-filters",
    label: "Guest filters",
    route: "/guests",
    tooltip: "Change what you are looking at without deleting anyone.",
    body: "Filters only change what you are looking at. They do not remove guests from the wedding.",
    why: "Filters help you focus on one group, side, or RSVP status at a time.",
    nextAction: "Clear filters when you want to see everyone again.",
    tone: "info",
  },
  {
    key: "guests-bulk-rsvp",
    label: "Bulk RSVP",
    route: "/guests",
    tooltip: "Update several RSVP replies at once.",
    body: "Select several guests, then update their RSVP together. This is useful when you receive a batch of replies.",
    why: "Batch updates prevent repetitive work after calls, texts, or paper replies.",
    nextAction: "Select the guests first, then choose the RSVP status.",
    tone: "info",
  },
  {
    key: "vendors-summary",
    label: "Vendor summary",
    route: "/vendors",
    tooltip: "See which vendors are booked, researching, or undecided.",
    body: "Use the summary to see which vendors are booked, researching, or still undecided.",
    why: "Vendor decisions often carry deposits and deadlines, so status needs to be obvious.",
    nextAction: "Review the undecided group before making a new booking.",
    tone: "info",
  },
  {
    key: "vendors-add",
    label: "Add vendor",
    route: "/vendors",
    tooltip: "Save a vendor option before or after booking.",
    body: "Create a vendor as soon as someone becomes a serious option. You can store quotes before you sign.",
    why: "A vendor record gives quotes, notes, and payments one place to live.",
    nextAction:
      "Add the vendor name and category first; details can come later.",
    tone: "next-step",
  },
  {
    key: "vendors-detail",
    label: "Vendor details",
    route: "/vendors",
    tooltip: "Keep contact, quote, contract, and payment notes together.",
    body: "Keep contact info, quote details, and payment notes here so no one has to search email threads later.",
    why: "Vendor details are easier to share and verify when they are not scattered across messages.",
    nextAction: "Record the next quote, payment, or contract status you know.",
    tone: "info",
  },
  {
    key: "seating-toolbar",
    label: "Seating controls",
    route: "/seating",
    tooltip: "Create tables, arrange guests, then save when ready.",
    body: "Set up tables first, then drag confirmed guests into seats. Changes stay local until you save.",
    why: "Seating usually changes many times, so drafts should feel safe.",
    nextAction:
      "Create the tables first, then place likely or confirmed guests.",
    tone: "safety",
  },
  {
    key: "seating-canvas",
    label: "Seating chart",
    route: "/seating",
    tooltip: "Your editable table layout and seat assignments.",
    body: "Drag guests and tables slowly on touch screens. Empty seats are fine while you are still deciding.",
    why: "A partial seating chart is still useful while RSVP answers are coming in.",
    nextAction: "Save only when the arrangement is worth keeping.",
    tone: "safety",
  },
  {
    key: "website-slug",
    label: "Website address",
    route: "/website",
    tooltip: "The short name at the end of your public website link.",
    body: "The slug is the last part of your public website address. Keep it short and easy to type.",
    why: "Guests may type this link from an invitation or message.",
    nextAction: "Use names and a date or place, without spaces.",
    tone: "info",
  },
  {
    key: "website-editor",
    label: "Website editor",
    route: "/website",
    tooltip: "Write the details guests should see on your wedding site.",
    body: "Fill in only what you are ready to share. Blank optional fields can stay blank.",
    why: "You can prepare the public website gradually without publishing every draft.",
    nextAction:
      "Start with the title, date, and venue details guests need most.",
    tone: "info",
  },
  {
    key: "website-publish",
    label: "Publish controls",
    route: "/website",
    tooltip: "Save privately or update the live website guests can see.",
    body: "Save draft keeps changes private. Publish live updates what guests can see.",
    why: "Publishing affects guests, while saving a draft only updates your private workspace.",
    nextAction:
      "Preview your details, then publish when they are ready for guests.",
    tone: "safety",
  },
  {
    key: "website-rsvp-links",
    label: "RSVP links",
    route: "/website",
    tooltip: "Private RSVP links made for each household.",
    body: "An RSVP link is a private link for one household. Send each household its own link.",
    why: "Household links keep replies tied to the right people and plus-ones.",
    nextAction:
      "Publish the site first, then send each household its own link.",
    tone: "safety",
  },
  {
    key: "settings-billing",
    label: "Billing",
    route: "/settings",
    tooltip: "Open secure plan and payment settings.",
    body: "Review plan status and billing management here. Opening billing may take you to a secure Stripe browser tab.",
    why: "Payment details should be managed through a secure billing page.",
    nextAction: "Use billing management for plan or payment changes.",
    tone: "safety",
  },
  {
    key: "settings-team",
    label: "Wedding team",
    route: "/settings",
    tooltip: "Invite your partner or planner with their own login.",
    body: "Invite your partner or planner with their own login. Avoid sharing your password.",
    why: "Separate logins protect the account and make collaboration cleaner.",
    nextAction: "Invite collaborators by email instead of sharing credentials.",
    tone: "safety",
  },
  {
    key: "settings-export",
    label: "Export downloads",
    route: "/settings",
    tooltip: "Download planner data as spreadsheet-friendly files.",
    body: "Download creates a CSV file on your device. Your browser usually puts it in Downloads.",
    why: "Exports give you a backup and make sharing with helpers easier.",
    nextAction: "Check your Downloads folder after exporting.",
    tone: "info",
  },
  {
    key: "settings-archive",
    label: "Archive wedding",
    route: "/settings",
    tooltip: "Make the wedding read-only after planning is done.",
    body: "Archive makes the wedding read-only. It keeps the data but prevents accidental edits.",
    why: "Archiving protects finished wedding information from accidental changes.",
    nextAction: "Export important data before archiving the wedding.",
    tone: "safety",
  },
];

export const helpTopics: HelpTopic[] = [
  {
    id: "just-starting",
    title: "I’m just starting",
    summary:
      "Follow the first useful steps without needing to understand every part of Kaiplan yet.",
    route: "/dashboard",
    steps: [
      "Use the dashboard First steps list as your path.",
      "Add one budget category, one guest, and one vendor before filling in details.",
      "Turn on Help mode if a control looks unfamiliar.",
    ],
    controls: [
      "dashboard-quick-actions",
      "dashboard-modules",
      "budget-add-category",
      "guests-add",
      "vendors-add",
    ],
  },
  {
    id: "getting-started",
    title: "Getting started",
    summary:
      "Set up the first wedding, then let Kaiplan guide the first useful actions.",
    route: "/dashboard",
    steps: [
      "Create or select the wedding workspace.",
      "Open the dashboard tour from Help if it did not start automatically.",
      "Use First steps to add the first budget category, guest, vendor, seating plan, and website draft.",
    ],
    controls: ["dashboard-quick-actions", "dashboard-modules"],
  },
  {
    id: "spreadsheets",
    title: "Moving from a spreadsheet",
    summary: "Bring over guest data without requiring spreadsheet expertise.",
    route: "/guests",
    steps: [
      "Open your spreadsheet and save or download it as CSV.",
      "Use Import CSV on the Guest List page.",
      "Review any row errors before closing the import dialog.",
    ],
    controls: ["guests-import", "guests-filters"],
  },
  {
    id: "guests-rsvp",
    title: "Guests and RSVPs",
    summary: "Manage households, plus-ones, filters, and batches of replies.",
    route: "/guests",
    steps: [
      "Add primary guests first.",
      "Use plus-one actions for invited partners or companions.",
      "Select guests when you need to update RSVP status in a batch.",
    ],
    controls: ["guests-add", "guests-bulk-rsvp", "website-rsvp-links"],
  },
  {
    id: "budget-vendors",
    title: "Budget and vendors",
    summary: "Track real quote numbers, deposits, and vendor decisions.",
    route: "/budget",
    steps: [
      "Create broad budget categories before adding small line items.",
      "Add vendors when they become real options, even before booking.",
      "Keep quote and payment notes in the vendor detail panel.",
    ],
    controls: [
      "budget-summary",
      "budget-add-category",
      "budget-category-panel",
      "vendors-summary",
      "vendors-add",
      "vendors-detail",
    ],
  },
  {
    id: "worried-budget",
    title: "I’m worried about budget",
    summary:
      "Use broad categories and real quotes to see what is planned, paid, and still flexible.",
    route: "/budget",
    steps: [
      "Add the largest costs first, even if the amount is approximate.",
      "Record deposits and payments as they happen.",
      "Use vendor quote notes to compare options before committing.",
    ],
    controls: [
      "budget-summary",
      "budget-add-category",
      "budget-category-panel",
      "vendors-detail",
    ],
  },
  {
    id: "seating",
    title: "Seating basics",
    summary:
      "Build the chart from guests who are likely or confirmed to attend.",
    route: "/seating",
    steps: [
      "Open Seating after at least a few guests are in the list.",
      "Create tables before placing guests.",
      "Save when the arrangement is ready to keep.",
    ],
    controls: ["seating-toolbar", "seating-canvas"],
  },
  {
    id: "website",
    title: "Wedding website and invite links",
    summary:
      "Draft privately, publish when ready, and send household RSVP links.",
    route: "/website",
    steps: [
      "Choose a short website address.",
      "Use Save draft while you are still editing privately.",
      "Publish live only when the details are ready for guests.",
      "Send each household its own RSVP link after publishing.",
    ],
    controls: [
      "website-slug",
      "website-editor",
      "website-publish",
      "website-rsvp-links",
    ],
  },
  {
    id: "account-safety",
    title: "Billing, exports, and account safety",
    summary:
      "Understand downloads, secure billing pages, team access, and archive behavior.",
    route: "/settings",
    steps: [
      "Use billing management for payment details or plan changes.",
      "Invite collaborators instead of sharing passwords.",
      "Export important data before archiving after the wedding.",
    ],
    controls: [
      "settings-billing",
      "settings-team",
      "settings-export",
      "settings-archive",
    ],
  },
];

export const tourDefinitions: TourDefinition[] = [
  {
    id: "dashboard",
    title: "Dashboard tour",
    description: "A quick pass through the planning workspace.",
    steps: [
      {
        route: "/dashboard",
        targetKey: "dashboard-quick-actions",
        title: "Start with the fast actions",
        body: "These buttons take you to the work couples usually do first. Nothing here publishes or deletes anything.",
      },
      {
        route: "/dashboard",
        targetKey: "dashboard-modules",
        title: "Read the planning cards",
        body: "The cards are a status map. Open one when you want to work on that part of the wedding.",
      },
      {
        route: "/checklist",
        targetKey: "checklist-buckets",
        title: "Use the checklist as your timeline",
        body: "Open the nearest milestone section, check off what is already done, and add anything special to your wedding.",
      },
      {
        route: "/budget",
        targetKey: "budget-add-category",
        title: "Create the first budget category",
        body: "Start with a cost you already know. Venue, catering, and photography are good first categories.",
      },
      {
        route: "/guests",
        targetKey: "guests-add",
        title: "Add guests or import a CSV",
        body: "CSV is a spreadsheet file. If you already have names in a spreadsheet, import it; otherwise add guests one by one.",
      },
      {
        route: "/vendors",
        targetKey: "vendors-add",
        title: "Track vendors before booking",
        body: "Add vendors while you are comparing options. Quotes and notes are useful before a contract is signed.",
      },
      {
        route: "/seating",
        targetKey: "seating-toolbar",
        title: "Build seating when guests are ready",
        body: "Create tables first, then place guests. Save only when the arrangement is worth keeping.",
      },
      {
        route: "/website",
        targetKey: "website-publish",
        title: "Draft privately, publish later",
        body: "Save draft keeps changes private. Publish live updates the public website guests can open.",
      },
      {
        route: "/settings",
        targetKey: "settings-export",
        title: "Download your data anytime",
        body: "Exports create CSV files your browser saves to your device, usually in Downloads.",
      },
    ],
  },
  {
    id: "help-center",
    title: "Help center tour",
    description: "A short orientation to the guidance available in Kaiplan.",
    steps: [
      {
        route: "/help",
        title: "Use Help when you feel stuck",
        body: "This page explains common wedding-planning tasks in plain language. You can restart tours, turn on Help mode, or jump straight to the page you need.",
      },
    ],
  },
];

export function getTourDefinition(tourId: string) {
  return tourDefinitions.find((tour) => tour.id === tourId) ?? null;
}

export function getHelpControl(key: string) {
  return helpControls.find((control) => control.key === key) ?? null;
}

export function getHelpTopic(topicId: string) {
  return helpTopics.find((topic) => topic.id === topicId) ?? null;
}

export const appHelpSurfaces = [
  {
    id: "app.surface.dashboard",
    domain: "app",
    audience: "authenticated",
    consumers: ["app-help", "app-support"],
    source: "canonical-kb",
    route: "/dashboard",
    label: "Dashboard",
    description: "Status overview and first planning actions.",
  },
  {
    id: "app.surface.checklist",
    domain: "app",
    audience: "authenticated",
    consumers: ["app-help", "app-support"],
    source: "canonical-kb",
    route: "/checklist",
    label: "Checklist",
    description: "Wedding milestone tasks grouped by timeline.",
  },
  {
    id: "app.surface.budget",
    domain: "app",
    audience: "authenticated",
    consumers: ["app-help", "app-support"],
    source: "canonical-kb",
    route: "/budget",
    label: "Budget",
    description: "Budget categories, line items, payments, and balances.",
  },
  {
    id: "app.surface.guests",
    domain: "app",
    audience: "authenticated",
    consumers: ["app-help", "app-support"],
    source: "canonical-kb",
    route: "/guests",
    label: "Guests",
    description: "Guest households, plus-ones, RSVP status, and CSV import.",
  },
  {
    id: "app.surface.vendors",
    domain: "app",
    audience: "authenticated",
    consumers: ["app-help", "app-support"],
    source: "canonical-kb",
    route: "/vendors",
    label: "Vendors",
    description: "Vendor options, booking status, quote notes, and contacts.",
  },
  {
    id: "app.surface.seating",
    domain: "app",
    audience: "authenticated",
    consumers: ["app-help", "app-support"],
    source: "canonical-kb",
    route: "/seating",
    label: "Seating",
    description: "Draft table layouts and assign guests before saving.",
  },
  {
    id: "app.surface.website",
    domain: "app",
    audience: "authenticated",
    consumers: ["app-help", "app-support"],
    source: "canonical-kb",
    route: "/website",
    label: "Website",
    description: "Private drafts, public publishing, and household RSVP links.",
  },
  {
    id: "app.surface.settings",
    domain: "app",
    audience: "authenticated",
    consumers: ["app-help", "app-support"],
    source: "canonical-kb",
    route: "/settings",
    label: "Settings",
    description: "Billing, team access, exports, and archive controls.",
  },
] as const;
