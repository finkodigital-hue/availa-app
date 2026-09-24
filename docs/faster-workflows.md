# Faster salon workflows

Work is isolated on `codex/faster-booking-workflows`; no production deployment or database migration is part of this change.

## Try these flows

- **Booking:** select an existing customer. If their last completed visit still has an active service, optionally reuse that service and an eligible active stylist. Current service pricing applies. Select a fresh time, review payment and confirm.
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

## Round two: `codex/faster-workflows-round-two`

- **Next opening:** in the staff booking dialog, choose a service and stylist, then find the first available day in the next 14 days with five scoped reads. Select a time and complete the existing review step. Failed availability reads show an error and no selectable times. A new customer's entered details remain when returning to that step.
- **Calendar:** open an appointment and use Book again to prefill an eligible customer, service and stylist. The new appointment still needs a fresh time and review.
- **Checkout:** calendar and booking details keep the appointment open while preparing a Stripe Checkout link. The link opens on an explicit click in a separate tab. Check payment status reads the booking from the business-scoped database; opening Checkout never marks the booking paid.
- **Daily preparation:** the dashboard shows up to 20 upcoming or in-progress visits today with service, stylist, appointment balance and appointment-linked form count/status. Private customer notes load only after opening them. The form summary is not a full requirements or patch-test clearance check.
- **Service admin:** Update several previews percentage price changes or archives for chosen active services. The write checks the previously displayed price/status and business ID for each service; changed or failed rows are skipped and reported for review. Existing appointment prices are not recalculated.

Round two verification: `npm run build`, `node scripts/test-next-available-slots.mjs`, `node scripts/test-dashboard-preparation.mjs`, `node scripts/test-balance-checkout-ui.mjs`, and `node scripts/test-booking-workflow-ui.mjs` pass with fictional data and mocked providers. The older booking fixture now points Vite dependency scanning only at its fixture page. No Docker or real customer, payment or notification operation was used. A signed-in disposable-workspace review is still needed before release.
