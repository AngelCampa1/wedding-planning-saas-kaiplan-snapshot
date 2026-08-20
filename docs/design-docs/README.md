# Design docs

Seven features, each written up before it was built.

The workflow was the same every time: a **spec** that settles the decisions and records why, then a **plan** that turns the spec into a file map and an ordered task list, then test-driven implementation against that list, then review, then merge. The artifacts were kept rather than deleted after the work shipped, which is why you can read the reasoning and not just the result.

The specs are the more interesting half. Most open with a decisions log in the form Decision / Choice / Rationale, so a reader can see what the alternatives were and why one won. The budget ledger spec, for instance, records choosing flat CRUD with query-time aggregation over a denormalized rollup, on the grounds that a wedding has thirty to fifty line items and a rollup would buy nothing but sync bugs. Whether that held up is checkable: the aggregation is still in `apps/api/src/routes/budget.ts` and it never grew a cache.

The plans open with goal, architecture, and a full list of files to add or change, then a checkboxed task sequence.

| Feature | Spec | Plan |
|---|---|---|
| Auth and dashboard shell | [spec](specs/2026-04-07-auth-dashboard-shell-design.md) | [plan](plans/2026-04-07-auth-dashboard-shell.md) |
| Budget ledger | [spec](specs/2026-04-07-budget-ledger-design.md) | [plan](plans/2026-04-07-budget-ledger.md) |
| Guest list and RSVP | [spec](specs/2026-04-07-guest-list-rsvp-design.md) | [plan](plans/2026-04-07-guest-list-rsvp.md) |
| Dashboard enhancements | [spec](specs/2026-04-11-dashboard-enhancements.md) | [plan](plans/2026-04-11-dashboard-enhancements.md) |
| Email template redesign | [spec](specs/2026-04-11-email-template-redesign.md) | [plan](plans/2026-04-11-email-template-redesign.md) |
| Seating chart UX | [spec](specs/2026-04-11-seating-ux-improvements.md) | [plan](plans/2026-04-11-seating-ux-improvements.md) |
| Exit-intent popup | [spec](specs/2026-06-09-exit-intent-popup-page-tailoring-design.md) | [plan](plans/2026-06-09-exit-intent-popup-page-tailoring.md) |

These are historical documents. They describe the product as it was being built and have not been updated since; where they disagree with the code, the code is right.
