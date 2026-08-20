---
title: "How to Import and Manage Your Guest List in Kaiplan"
description: "Step-by-step guide to building your guest list in Kaiplan: CSV import, manual entry, RSVP tracking, dietary notes, plus-ones, and exporting for your caterer."
publishedAt: "2026-04-29"
updatedAt: "2026-05-19"
buyerStage: "bofu"
ctaMode: "convert"
schema: "HowTo"
bluf: "You can build your guest list in Kaiplan by importing a CSV from a spreadsheet or adding guests manually. Once guests are loaded, you track RSVP status, dietary notes, and linked plus-one records in one place. This guide walks through the full process from initial import through final headcount export."
faqs:
  - q: "What format does the CSV need to be in for the Kaiplan import?"
    a: "Kaiplan accepts standard CSV files with first_name and last_name as required columns. Optional columns include email, phone, side, group_name, dietary_tags, and dietary_notes. Extra columns are ignored."
  - q: "Can I add guests after the initial import?"
    a: "Yes. You can add individual guests at any time after the initial import. The import is a one-time bulk action for your existing list, but you can always add new guests manually as your list grows or changes."
  - q: "Does Kaiplan send RSVPs or invitation emails to guests?"
    a: "Kaiplan does not send invitation emails. If your Kaiplan wedding website is published, guests can respond through its RSVP flow; otherwise, you can collect responses through physical cards, phone calls, or another website and record the responses manually."
  - q: "Can I export my guest list from Kaiplan?"
    a: "Yes. The guest list can be exported as a CSV. This is useful for sharing with your venue coordinator, caterer, or for importing into a seating chart tool."
relatedPages:
  - "/pricing"
  - "/resources/guides/how-to-plan-a-wedding"
  - "/free/budget-template"
statistics:
  - stat: "Average US wedding guest count is 167 people"
    source: "The Knot Real Weddings Study 2026"
    sourceUrl: "https://www.theknot.com/content/average-wedding-cost"
  - stat: "Nearly 40% of couples say managing the guest list was one of the most stressful parts of wedding planning"
    source: "WeddingWire Newlywed Report"
    sourceUrl: "https://www.weddingwire.com/wedding-ideas/newlywed-report"
  - stat: "Couples typically send invitations 8-10 weeks before the wedding and set RSVP deadlines 3-4 weeks before"
    source: "The Knot Wedding Planning Guide"
    sourceUrl: "https://www.theknot.com/content/when-to-send-wedding-invitations"
---

## Why Guest List Management Matters

The guest list is one of those planning areas that feels manageable at the start and becomes genuinely complicated as the wedding date approaches. A spreadsheet works fine when you're tracking 40 names. When you're at 150 guests, managing RSVP status, dietary notes, linked plus-one records, and household details across multiple tabs while fielding messages from family members about whether their distant cousin accepted — the spreadsheet starts breaking down.

Kaiplan's guest list feature centralizes all of that in one place: RSVPs, dietary notes, linked plus-ones, households, and final headcount totals. And because it's in the same tool as your budget and vendor data, you don't need to switch between apps to get a complete picture of your planning status.

This guide covers the full process: preparing your data, importing it, setting up the fields you care about, and keeping the list updated through your RSVP deadline.

---

## Step 1: Prepare Your Guest List Data

Before importing, you need your guest list in a spreadsheet format. If you're starting fresh, build a simple spreadsheet in Google Sheets or Excel with one row per guest.

**Recommended columns for your import spreadsheet:**

| Column        | Notes                                         |
| ------------- | --------------------------------------------- |
| first_name    | Required                                      |
| last_name     | Required                                      |
| email         | Optional but useful for digital RSVP tracking |
| phone         | Optional                                      |
| side          | Optional: partner1, partner2, or mutual       |
| group_name    | Optional household or group label             |
| dietary_tags  | Optional comma-separated dietary tags         |
| dietary_notes | Optional freeform notes                       |

If you already have a guest list in a spreadsheet but it uses different column names (like "Guest First" instead of "first_name"), rename the headers before exporting. The current importer expects these field names directly and ignores extra columns.

**Handling households:** If you're tracking guests by household or party, you have two options:

1. List each person as a separate row (recommended for RSVP tracking, since each person RSVPs individually)
2. Use a party or household grouping field to link guests

Most couples find individual rows cleaner for RSVP tracking, even if it means more rows initially.

---

## Step 2: Export Your Spreadsheet as a CSV

Once your spreadsheet is ready, export it as a CSV file:

- **Google Sheets:** File > Download > Comma-separated values (.csv)
- **Microsoft Excel:** File > Save As > CSV (Comma delimited)
- **Apple Numbers:** File > Export To > CSV

Save the CSV somewhere you can easily find it (your Downloads folder or Desktop).

---

## Step 3: Import the CSV into Kaiplan

1. Log in to Kaiplan and navigate to the **Guests** section
2. Look for the **Import** button or option (typically in the top-right area of the guest list view)
3. Upload your CSV file
4. Run the import. Kaiplan validates the CSV and saves valid rows.
5. Review the import result for saved rows and row-level errors.
6. Correct any failed rows in your spreadsheet and upload a revised CSV if needed.

**What to check after import:**

- Scroll through the imported guest list and verify the names and data look correct
- Check that dietary tags and notes imported into the right fields
- Look for any rows that may have imported incorrectly (blank names, misaligned data)

If anything looks wrong, delete or edit the affected guests and re-import with a corrected CSV.

---

## Step 4: Add Guests Manually (for One-Off Additions)

For guests added after the initial import, use the manual add flow:

1. In the Guests section, click **Add Guest**
2. Enter the guest's first and last name
3. Fill in any other fields you have available (email, phone, party association)
4. Save the guest record

You can always come back to a guest record and add more information later. It's better to add a guest with minimal info now than to try to remember to add them later.

**Adding plus-ones before you know the name:**

If a guest has a plus-one but you don't know who yet, keep that note on the host guest. Once you have the name (usually after RSVPs come in), add the plus-one as a separate linked guest record.

---

## Step 5: Track RSVP Status as Responses Come In

Once your invitations are sent, this is the section you'll update most frequently.

**RSVP statuses in Kaiplan:**

- **Pending:** On your list but not yet invited (useful for tracking a B-list if you plan to send invitations in waves)
- **Invited:** Invitation sent, response not yet received
- **Accepted:** Guest has confirmed they're coming
- **Declined:** Guest has declined

As responses come in — whether by physical response card, through your wedding website, by phone, or by text — update each guest's status in Kaiplan.

**The RSVP dashboard:** The guest list view shows you running totals: total invited, total accepted, total declined, total not yet responded. As you get closer to your RSVP deadline, this view tells you exactly how many non-responses you need to follow up on.

**Following up on non-responses:** Wedding etiquette around this is a whole topic in itself, but from a logistics standpoint: about 1-2 weeks before your RSVP deadline, filter your guest list to show guests with "invited" status and no response. These are the people you need to contact. Having this list in Kaiplan makes the follow-up process manageable.

---

## Step 6: Record Dietary Notes

If your caterer needs allergy or dietary restriction details, record dietary tags and notes for each attending guest.

**Two approaches:**

**With the invitation:** Some couples include a dietary restriction field with the physical invitation or RSVP form. If you collect notes this way, add the tags and details as you enter each RSVP.

**Separate from RSVP:** If you collect dietary details separately, you can add them to guest records after RSVP tracking is complete.

**Getting the final list:** Once all RSVPs are in, export the guest list and share the dietary tags and notes with your caterer so they can review individual guest needs.

---

## Step 7: Handle Plus-Ones

Managing plus-ones is one of the trickier parts of any guest list because the number of plus-ones often shifts as the planning progresses.

**Kaiplan's plus-one handling:**

Kaiplan models plus-ones as linked guest records. You can:

- Add the plus-one as their own guest row
- Link the plus-one to the host guest's household
- Track the plus-one's RSVP status and dietary notes separately

If a plus-one is unknown at invitation time, keep the host guest's notes updated and add the plus-one guest row once you have the person's name.

**Tracking your plus-one budget impact:** Plus-ones have direct budget implications (most venues and caterers charge per head). Each plus-one confirmation increases your headcount, which may affect your catering quote. Some couples track this by keeping a separate running count of confirmed plus-ones and checking it against their venue's per-person pricing.

---

## Step 8: Export for Venue and Caterer

As your wedding date approaches, you'll need to share headcount information with your venue and caterer.

**Exporting from Kaiplan:**

Open Settings and use the export controls. You can export:

- A full guest list CSV (all guests with all fields)
- Budget and vendor CSVs from the same settings area

The guest export gives you a clean spreadsheet you can send directly to your venue coordinator or caterer. For caterers who need dietary details, the export includes dietary tags and notes for individual guests.

---

## Keeping the Guest List Current

The guest list is most accurate when it's updated in real time as information changes. A few habits that help:

- When you receive a response card, update the RSVP status immediately rather than batching updates weekly
- When a guest asks to bring a different plus-one, update the record right away
- When a guest cancels after having already RSVP'd yes, update their status to declined and note the date — your caterer may need to adjust their count
- When you finalize meal choices, record them before you forget which guest said what

The goal is a guest list that's accurate enough that you can hand it to a venue coordinator and be confident it reflects your actual headcount. Inaccurate headcounts in the final weeks can affect catering minimums, seating arrangements, and vendor staffing. Keeping the data current in Kaiplan makes those final weeks less stressful.

---

## Guest List and Your Budget

One thing worth connecting: your guest count drives a significant portion of your total wedding cost. Per-person costs for catering, venue minimums, and sometimes photography coverage all scale with headcount. Every confirmed plus-one or B-list invitation that results in an accepted RSVP affects your budget.

Kaiplan's budget tracker and guest list are in the same tool, which means you can see your current headcount and your current budget status side by side. If your accepted count is growing faster than you expected and your per-person catering cost is locked in, update the relevant vendor amount or budget item so the tracker reflects the commitment.

See the [pricing page](/pricing) for Kaiplan plan details.
