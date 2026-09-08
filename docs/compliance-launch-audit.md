# Bookzenvo launch compliance audit

Audit date: 8 September 2026
Primary market assumed: United Kingdom

This is an engineering risk review, not a substitute for advice from a qualified solicitor or data-protection professional.

## Video checklist disposition

| Requirement               | Disposition                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy            | Implemented at `/privacy`; covers roles, data categories, sources, purposes and lawful bases, processors, international transfers, retention, rights, security, reviews, and AI processing.                                                                                                                             |
| Terms and conditions      | Implemented at `/terms`; separates Bookzenvo from each appointment supplier and covers accounts, payments, billing, content, data processing, availability, termination, and liability.                                                                                                                                 |
| Cookie policy and consent | Implemented at `/cookie-policy`. Source review found no advertising or analytics tracking. Only necessary browser storage is documented. Consent controls already exist in case optional categories are introduced.                                                                                                     |
| Refund policy             | Added `/refund-policy`, separating SaaS subscriptions from appointment payments and preserving statutory rights.                                                                                                                                                                                                        |
| Form notice and consent   | Waitlist now gives a just-in-time privacy notice. Booking confirmation now identifies the supplier relationship and links privacy, platform, cancellation, and refund terms. Consultation forms already require separate explicit health-data consent and retain the signed wording/version.                            |
| Data minimisation         | Booking phone and notes are optional. Existing GDPR-style export/erasure functions and privacy cleanup are present. Consultation templates require a purpose-specific consent statement.                                                                                                                                |
| Rights-flow completeness  | Customer exports include consultation and patch-test health data, consent evidence and signatures. Confirmed erasure deletes those records and their audit events rather than leaving identifiable health data behind. Pending requests display a one-month response deadline.                                          |
| Analytics tracking        | No Google Analytics, Tag Manager, Hotjar, Mixpanel, Segment, or equivalent client tracker was found in `src` or `public`. Re-audit before adding any telemetry.                                                                                                                                                         |
| Third-party embeds        | The automatic Google Maps iframe was removed. Visitors now choose an external Maps link, so Google receives no request merely because the booking page loaded. Internal preview iframes remain same-origin.                                                                                                             |
| Accessibility             | Existing skip link, semantic labels, focus styles, keyboard controls, image alternatives, and accessible review ratings were confirmed. Production build passes. A manual keyboard and screen-reader pass is still required before launch and after material UI changes.                                                |
| Reviews and claims        | Public reviews come from completed bookings, require publication consent, and cannot be edited by businesses. Moderation is reason-based and audited. Legacy free-text testimonials are filtered from live pages. No third-party review import is currently claimed.                                                    |
| Business details          | Appointment businesses can publish their real address, phone, hours, and policies. The platform operator's verified legal name, legal form, service address, and (if applicable) company and VAT numbers must still be supplied before launch; these facts were not present in the repository and must not be invented. |
| Image copyright           | Upload terms require businesses to have rights and permissions. Built-in marketing/demo image licences or original-source records must be assembled by the operator before launch. User-uploaded content needs a notice-and-takedown process.                                                                           |

## UK launch actions that cannot be completed in code

1. Insert and verify the platform operator's legal identity, geographic/service address, legal form, company number and VAT number where applicable.
2. Have UK counsel review the final customer contract, subscription cancellation/refund wording, marketplace role split, liability terms, and salon-facing template wording.
3. Complete an ICO fee/self-assessment, records of processing, processor agreements, international-transfer assessment, breach procedure, retention schedule, and data-subject-request procedure.
4. Record licences or provenance for every bundled photo, font, icon, logo, and marketing asset. Replace anything without evidence of rights.
5. Run manual keyboard-only, zoom, screen-reader, and colour-contrast tests on the production deployment. Treat WCAG 2.2 AA as the engineering target, while obtaining advice on the Equality Act reasonable-adjustment duty.
6. Confirm each salon displays accurate pre-contract identity, price, cancellation, deposit, refund, complaint, and contact information. The platform cannot truthfully manufacture these business-specific facts.
7. Re-run the launch audit whenever analytics, advertising, embeds, subprocessors, AI data flows, markets, or payment terms change.

Use the short operational hand-off in [`uk-launch-checklist.md`](./uk-launch-checklist.md) before approving release.
