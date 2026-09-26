# Bookzenvo owner-interface clarity review

Reviewed 2026-09-26 on `codex/workspace-clarity`. Scope: the owner-facing routes and their main empty, loading, action and error states, plus the shared font rules. This is a source-code review, not a claim that every path has been used on a physical device or by a first-time salon owner. Do not use imported customer data for follow-up tests.

## Screen-by-screen inventory

| Screen | What is clear now | Still needs a real usability check |
| --- | --- | --- |
| Sign-in | Email and password fields have clear controls; app-wide headings now use the readable system face. | Test recovery, incorrect credentials and Google sign-in with a new tester. |
| Initial setup | Business name, booking link and final action now use plain words instead of “workspace”. | Ask a new owner whether they understand the booking link before creating it. |
| Dashboard | Next booking and preparation list show customer, service and amount due. | Watch an owner find the first action for a busy day and recover from a failed data load. |
| Phone navigation and search | Phone tabs now say Bookings and Payments, matching the pages they open; labels are larger. Quick search does not offer restricted pages to staff. | Check reachability and text fit on a small physical phone. |
| Calendar | Existing booking grid and interaction have been deliberately preserved. | Test date navigation, new booking, move, block time and keyboard use on a real device. |
| Bookings | Search, period/status filters and appointment details are visible. Failed loads now have a retry button; rows work with Enter and Space. | Check whether two filters plus search feel obvious to someone new, and test the dense booking detail dialog. |
| Customers | Search and add-customer action are clear; empty state points to the first action. | Test notes, visit history, export and privacy actions with fictional customers. |
| Consultations | Tabs now say “Forms to send” and “Customer forms”; the page says what to do. | Test create, send, sign and patch-test review end to end. Medical wording and access still need specialist review. |
| Staff | Add-staff action, profile, hours and service tabs are discoverable. | Test the disabled free-plan state, account invitations and reassignment before removal. |
| Independent professionals | Explanation is shorter; the remove control is visible without hover. | Test invite acceptance and chair-rent setup with a self-employed person. |
| Services | New-service action and first-service empty state are clear. | The split editor, categories, assigned staff and stock recipes are dense; observe a new owner creating a service. |
| Stock | Main purpose is stated plainly, with quantity controls and a first-item path. | Test photo scanning, stock adjustments and low-stock concepts; several failures still expose technical messages. |
| Payments | Paid/outstanding amounts and payment rows are visible. Failed loads have a retry button; rows work with Enter and Space. | Test deposit, balance and refund decisions with fictional sandbox data. Never infer that a failed load means zero payments. |
| Gift cards | A manual free card is now distinguished from an online purchase. A failed card or activity load no longer appears as an empty list. | Test issue, copy, buy, redeem and refund with fictional data; check if the balance display is understood. |
| Reports | The page now states that it shows earnings and downloads. | Test date filters, totals and exports with a salon owner; confirm the numbers mean what they expect. |
| AI assistant | Quick questions and chat are visible. | Test the usefulness and truthfulness of answers against live fictional workspace data. |
| Page builder | Editing purpose is clearer; drag handle remains visible on narrow screens. | Test the full create/edit/undo/preview/publish path with a first-time owner, including keyboard and touch. |
| Settings | Main areas are grouped; “Bookzenvo branding” replaces “white-label”; domain instructions are tucked behind an explanation. | The page still has many options. Test whether an owner can find booking rules, messages, payments and account security unprompted. |
| Import | The heading explains moving data and checking before save. | Highest-risk workflow: rehearse with fictional exports, rollback and no outbound messages. |
| Public booking | Service, staff, time and details follow a short step-by-step path. The founder previously checked the QA details screen on a real phone. | Recheck the complete journey after the final release, including validation, email and optional payment. |
| Customer booking portal | Email-code sign-in, upcoming/past bookings and change actions are present. | Test a new customer using only the email they receive; check expired codes, cancellation limits and phone layouts. |

## Cross-app findings

1. The old serif was the global `--font-display` default. It is now replaced with a readable system stack for Bookzenvo UI. Salon-selected storefront fonts remain configurable, including a serif option; changing an existing salon design was outside this pass.
2. Common staff, service and stock failures now use task-specific messages, including a warning when service details saved but staff/product links did not. Other database/provider failures in settings and specialist editors still show raw `error.message`. Translate those carefully without concealing a payment or data-integrity problem.
3. Some controls and dense dialogs need physical-phone, keyboard, screen-reader and 200%/400% zoom checks. Source inspection cannot prove they are easy to use.
4. Wording alone does not validate workflow simplicity. Recruit at least one salon owner unfamiliar with Bookzenvo and ask them to complete five fictional tasks without coaching: make a booking, find a customer note, make a service, change opening hours and explain a gift-card payment. Record hesitation and wrong turns, then fix those before calling the interface simple.

No calendar behaviour, salon storefront typography choice, payments logic or live customer data was changed in this review.
