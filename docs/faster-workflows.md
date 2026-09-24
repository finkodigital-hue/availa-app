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
