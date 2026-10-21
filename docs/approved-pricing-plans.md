# Approved Free and Studio plans

Approved by Jakob on 21 October 2026. This is the agreed product/pricing decision, superseding earlier proposed feature splits. It does not establish that the live app, plan enforcement or marketing have been updated.

| Feature | Free (Solo) | Studio |
| --- | --- | --- |
| Monthly subscription | Free | £22/month |
| Staff members | One | Unlimited |
| Unlimited bookings and calendar | Included | Included |
| Online booking page | Included | Included |
| Manual page editing: colours, photos and wording | Included | Included |
| Services, prices and working hours | Included | Included |
| Customer records and booking history | Included | Included |
| Deposits and online payments | Included | Included |
| Refunds | Included | Included |
| Record cash/card payments and daily takings | Included | Included |
| Booking confirmation emails | Included | Included |
| Customer cancellation/rescheduling links | Included | Included |
| Import customers and bookings | Included | Included |
| Export customer data | Included | Included |
| Mobile access | Included | Included |
| Security and support | Included | Included |
| Verified customer reviews | Included | Included |
| Automatic email reminders | — | Included |
| Customer portal | — | Included |
| Gift cards | — | Included |
| Consultation forms and patch tests | — | Included |
| Stock management | — | Included |
| Automatic stock deduction | — | Included |
| Stock scanning from photos | — | Included |
| Reports and business insights | — | Included |
| AI business assistant | — | Included |
| AI booking-page editor | — | Included |
| Staff accounts and permissions | — | Included |
| Chair rental and commission tracking | — | Included |
| Calendar connections | — | Included, subject to release readiness |
| Own domain and email branding | — | Included, subject to release readiness |

## Separate decisions still needed

- SMS reminder pricing: paid credits or a monthly allowance; no unlimited allowance approved.
- AI usage allowance: Studio includes the tools, but a usage limit has not been decided.
- Payment processing: provider fees apply separately from the subscription.
- Tap to Pay: plan placement and release readiness remain undecided.
- Mobile app and provider-dependent integrations must pass their release checks before being advertised as available.

## Customer portal meaning

A customer sign-in area for upcoming and past appointments, eligible cancellation/rescheduling, contact details, and data export/deletion requests. Free retains appointment management through email links and customer data rights; portal access is Studio.

## Implementation and release

Implemented on `pricing-approved-20261021`: shared pricing descriptions for the public page and Settings > Plan; reviews available on both plans, including opt-in review-request emails; Studio checks for gift-card operations, reports, custom branding, provider calendar connections and staff account access. Existing AI, consultation, rent, reminder and portal checks remain in place. Free retains daily takings and manual page editing.

Apply `20261021010000_approved_plan_limits.sql` as part of release. It enforces database writes, suspends existing staff-account permissions on Free, prevents Free inventory reads and provider sync, and lets Free appointments complete without consuming stock from saved recipes. Reversing a previous Studio stock deduction restores its recorded quantity. Existing records are retained; paid gift orders already in flight can still fulfil idempotently after a downgrade.

Validation: TypeScript; the full launch-check suite and recovery checks; production build/security-boundary verification; 168-migration schema replay including 18 new plan assertions; mocked tests of the actual server handlers for Free denials, Studio analytics, Free reviews and publication consent. Full-file lint remains affected by existing lint debt; no new non-formatting lint errors were found in the changed files. Real provider/device readiness remains subject to the separate release checks above.

This records implementation in the release branch. It is not evidence that the migration has been applied or the change deployed to production.
