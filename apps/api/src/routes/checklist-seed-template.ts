import type { MilestoneBucket } from "@kaiplan/shared";

interface SeedTask {
  bucket: MilestoneBucket;
  title: string;
  dueOffsetDays: number | null;
}

export const SEED_TASKS: SeedTask[] = [
  // 12+ Months Out
  { bucket: "12mo_plus", title: "Set wedding date", dueOffsetDays: -365 },
  { bucket: "12mo_plus", title: "Establish guest count", dueOffsetDays: -365 },
  {
    bucket: "12mo_plus",
    title: "Set overall wedding budget",
    dueOffsetDays: -360,
  },
  { bucket: "12mo_plus", title: "Book wedding venue", dueOffsetDays: -350 },
  {
    bucket: "12mo_plus",
    title: "Hire wedding photographer",
    dueOffsetDays: -345,
  },
  {
    bucket: "12mo_plus",
    title: "Hire wedding videographer",
    dueOffsetDays: -340,
  },
  {
    bucket: "12mo_plus",
    title: "Begin wedding dress shopping",
    dueOffsetDays: -335,
  },
  { bucket: "12mo_plus", title: "Hire caterer", dueOffsetDays: -330 },

  // 9–12 Months Out
  { bucket: "9_to_12mo", title: "Book band or DJ", dueOffsetDays: -300 },
  { bucket: "9_to_12mo", title: "Send save-the-dates", dueOffsetDays: -300 },
  { bucket: "9_to_12mo", title: "Book florist", dueOffsetDays: -290 },
  { bucket: "9_to_12mo", title: "Book officiant", dueOffsetDays: -285 },
  {
    bucket: "9_to_12mo",
    title: "Begin planning honeymoon",
    dueOffsetDays: -280,
  },
  { bucket: "9_to_12mo", title: "Select wedding party", dueOffsetDays: -275 },
  {
    bucket: "9_to_12mo",
    title: "Research ceremony and reception decor style",
    dueOffsetDays: -270,
  },
  {
    bucket: "9_to_12mo",
    title: "Schedule engagement photo session",
    dueOffsetDays: -265,
  },

  // 6–9 Months Out
  {
    bucket: "6_to_9mo",
    title: "Book hair and makeup artists",
    dueOffsetDays: -240,
  },
  { bucket: "6_to_9mo", title: "Finalize guest list", dueOffsetDays: -230 },
  { bucket: "6_to_9mo", title: "Create wedding website", dueOffsetDays: -220 },
  { bucket: "6_to_9mo", title: "Order wedding cake", dueOffsetDays: -210 },
  { bucket: "6_to_9mo", title: "Register for gifts", dueOffsetDays: -200 },
  {
    bucket: "6_to_9mo",
    title: "Begin honeymoon bookings (flights, hotel)",
    dueOffsetDays: -195,
  },
  {
    bucket: "6_to_9mo",
    title: "Choose and order bridesmaid dresses",
    dueOffsetDays: -190,
  },
  {
    bucket: "6_to_9mo",
    title: "Schedule first dress fitting",
    dueOffsetDays: -185,
  },

  // 3–6 Months Out
  {
    bucket: "3_to_6mo",
    title: "Send wedding invitations",
    dueOffsetDays: -120,
  },
  { bucket: "3_to_6mo", title: "Order wedding rings", dueOffsetDays: -120 },
  { bucket: "3_to_6mo", title: "Final dress fitting", dueOffsetDays: -105 },
  {
    bucket: "3_to_6mo",
    title: "Book wedding day transportation",
    dueOffsetDays: -105,
  },
  {
    bucket: "3_to_6mo",
    title: "Plan and book rehearsal dinner venue",
    dueOffsetDays: -100,
  },
  { bucket: "3_to_6mo", title: "Choose wedding favors", dueOffsetDays: -95 },
  {
    bucket: "3_to_6mo",
    title: "Finalize menu with caterer",
    dueOffsetDays: -90,
  },
  {
    bucket: "3_to_6mo",
    title: "Book hotel room blocks for guests",
    dueOffsetDays: -90,
  },

  // 1–3 Months Out
  { bucket: "1_to_3mo", title: "Finalize seating chart", dueOffsetDays: -45 },
  {
    bucket: "1_to_3mo",
    title: "Confirm all vendor details",
    dueOffsetDays: -45,
  },
  {
    bucket: "1_to_3mo",
    title: "Apply for marriage license",
    dueOffsetDays: -40,
  },
  {
    bucket: "1_to_3mo",
    title: "Create detailed day-of timeline",
    dueOffsetDays: -35,
  },
  { bucket: "1_to_3mo", title: "Buy wedding party gifts", dueOffsetDays: -30 },
  {
    bucket: "1_to_3mo",
    title: "Finalize ceremony readings and music",
    dueOffsetDays: -28,
  },
  {
    bucket: "1_to_3mo",
    title: "Prepare ceremony programs",
    dueOffsetDays: -25,
  },
  {
    bucket: "1_to_3mo",
    title: "Confirm RSVP final headcount",
    dueOffsetDays: -30,
  },

  // Under 1 Month Out
  {
    bucket: "under_1mo",
    title: "Confirm final headcount with caterer",
    dueOffsetDays: -14,
  },
  {
    bucket: "under_1mo",
    title: "Pay remaining vendor balances",
    dueOffsetDays: -14,
  },
  {
    bucket: "under_1mo",
    title: "Prepare day-of emergency kit",
    dueOffsetDays: -7,
  },
  { bucket: "under_1mo", title: "Write wedding vows", dueOffsetDays: -14 },
  {
    bucket: "under_1mo",
    title: "Break in new wedding shoes",
    dueOffsetDays: -21,
  },
  {
    bucket: "under_1mo",
    title: "Assign day-of tasks to wedding party",
    dueOffsetDays: -10,
  },
  {
    bucket: "under_1mo",
    title: "Create vendor tip envelopes",
    dueOffsetDays: -7,
  },
  {
    bucket: "under_1mo",
    title: "Confirm honeymoon travel documents and reservations",
    dueOffsetDays: -7,
  },

  // Week Of
  {
    bucket: "week_of",
    title: "Attend rehearsal and rehearsal dinner",
    dueOffsetDays: -1,
  },
  {
    bucket: "week_of",
    title: "Delegate day-of responsibilities to coordinator or wedding party",
    dueOffsetDays: -2,
  },
  {
    bucket: "week_of",
    title: "Deliver items to venue (favors, programs, decor)",
    dueOffsetDays: -1,
  },
  {
    bucket: "week_of",
    title: "Confirm all vendor arrival times",
    dueOffsetDays: -2,
  },
  {
    bucket: "week_of",
    title: "Pick up wedding dress from alterations",
    dueOffsetDays: -3,
  },
  {
    bucket: "week_of",
    title: "Confirm honeymoon flight check-in",
    dueOffsetDays: -1,
  },

  // Day Of
  {
    bucket: "day_of",
    title: "Wedding day — get ready with wedding party",
    dueOffsetDays: 0,
  },
  { bucket: "day_of", title: "First look (if planned)", dueOffsetDays: 0 },
  { bucket: "day_of", title: "Wedding ceremony", dueOffsetDays: 0 },
  { bucket: "day_of", title: "Wedding reception", dueOffsetDays: 0 },
  { bucket: "day_of", title: "Honeymoon departure", dueOffsetDays: 1 },
  {
    bucket: "day_of",
    title: "Collect gifts and personal items from venue",
    dueOffsetDays: 0,
  },
];
