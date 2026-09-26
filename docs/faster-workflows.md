# Faster salon workflows

Work is isolated on `codex/faster-booking-workflows`; no production deployment or database migration is part of this change.

## Try these flows

- **Booking:** select an existing customer. If their last completed visit still has an active service, optionally reuse that service and an eligible active stylist. Current service pricing applies. Select a fresh time, review payment and confirm.
- **Customer profile:** Repeat last visit starts a new appointment from the customer's most recent completed service and stylist, where they are still active and eligible. Book appointment remains available for a different service. Neither action copies the old time or price.
- **Rebooking:** open an appointment in Bookings. Book again reuses its customer/service/stylist where still available. Finish appointment & rebook is offered for eligible started appointments; it marks the old appointment completed before opening the new booking. It does not settle an unpaid balance. Date shortcuts jump from today by 2/4/6/8 weeks.
- **Customer context:** private customer notes are available inside booking details. Consultation links open records filtered to the selected booking/customer. Expired signed forms are labelled expired; a recorded patch-test pass is not future treatment clearance.
- **Daily admin:** dashboard attention items surface a bounded shortlist of pending bookings, payment issues, unsigned forms and low stock. It is not an exhaustive safety/form-completion checklist.
- **Forms:** select an existing customer to reuse contact details, review them explicitly, then start a new form. Medical answers, consent, patch-test outcomes and signatures are not copied.

## Verification

- `npm run build` runs existing isolated launch regression checks, TypeScript, production compilation and the security-boundary check.
- `node scripts/test-consultation-status.mjs` checks expiry/withdrawal/patch-test status interpretation.
- `node scripts/test-booking-workflow-ui.mjs` runs an isolated Vite/Playwright fixture. All API requests are intercepted; the only submission is a mocked booking payload. It checks reuse, date selection, payment review, confirmation and mobile overflow without real data or messages.

The isolated UI fixture also exercises the actual private-notes component and start-signing dialog, including contact reuse, mandatory review and a contact-only payload. This is Docker-free and uses mocked data, not a signed-in database session.

The isolated UI fixture does not replace a signed-in end-to-end review of dashboard links and consultation creation in a disposable test workspace. Existing lint violations in legacy files remain; a full clean lint is not claimed.

## Next benchmark: make the whole visit easier

Use one fictional new-colour-client appointment to compare Bookzenvo with a salon's current system. Time each task, count clicks and repeated entry, and note every moment the tester leaves the software or asks for help:

1. Find the appointment and check which consultation or patch-test record needs attention.
2. Open the exact record and complete or review it, without treating a recorded pass as automatic clearance for treatment.
3. Take the remaining payment, complete the visit and book the next appointment.
4. Find the client's history at their next visit.

The first small improvement is now implemented: clicking an appointment's consultation panel opens its first attention-needed record directly. It does not change form requirements, consent, signatures or patch-test rules. The focused status test and Docker-free launch checks pass. A signed-in check in a disposable Studio salon is still needed.

Important gap to resolve before calling this a team workflow: the Consultations page is visible to staff with customer-management permission, while its server reads currently require the business owner. Any fix must review special-category data access and audit requirements first; do not simply expose records to every staff role.

The UI now matches that existing server boundary: only the owner sees consultation navigation, appointment/customer consultation links, or launches their owner-only status reads. This removes broken staff links; it does **not** complete the team workflow. Before enabling staff access, decide which roles may see record status versus medical answers, signatures and patch-test outcomes, then implement matching server permissions and an audit trail. Do not infer this from `customers.manage` alone.

## Round two: `codex/faster-workflows-round-two`

- **Next opening:** in the staff booking dialog, choose a service and stylist, then find the first available day in the next 14 days with five scoped reads. Select a time and complete the existing review step. Failed availability reads show an error and no selectable times. A new customer's entered details remain when returning to that step.
- **Calendar:** open an appointment and use Book again to prefill an eligible customer, service and stylist. The new appointment still needs a fresh time and review.
- **Checkout:** calendar and booking details keep the appointment open while preparing a Stripe Checkout link. The link opens on an explicit click in a separate tab. Check payment status reads the booking from the business-scoped database; opening Checkout never marks the booking paid.
- **Daily preparation:** the dashboard shows up to 20 upcoming or in-progress visits today with service, stylist, appointment balance and appointment-linked form count/status. Private customer notes load only after opening them. The form summary is not a full requirements or patch-test clearance check.
- **Service admin:** Update several previews percentage price changes or archives for chosen active services. The write checks the previously displayed price/status and business ID for each service; changed or failed rows are skipped and reported for review. Existing appointment prices are not recalculated.

Round two verification: `npm run build`, `node scripts/test-next-available-slots.mjs`, `node scripts/test-dashboard-preparation.mjs`, `node scripts/test-balance-checkout-ui.mjs`, and `node scripts/test-booking-workflow-ui.mjs` pass with fictional data and mocked providers. The older booking fixture now points Vite dependency scanning only at its fixture page. No Docker or real customer, payment or notification operation was used. A signed-in disposable-workspace review is still needed before release.
