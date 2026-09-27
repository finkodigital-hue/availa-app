# Bookzenvo UK launch checklist

Status date: 26 September 2026. This is a practical engineering hand-off, not legal approval.

The external evidence needed from the founders, grant records, providers and qualified advisers is listed in [`founder-legal-launch-evidence.md`](./founder-legal-launch-evidence.md). A source-code check cannot close those gates.

The grant and London event records can be indexed with [`grant-conference-evidence-template.md`](./grant-conference-evidence-template.md) without committing confidential award documents or payment evidence.

## Engineering completed

- Public privacy, platform terms, cookie, refund and verified-review policies are routed and linked.
- The public operator disclosure identifies BOOKZENVO LTD, private limited company registered in Scotland under SC902170, at Pinefield, Cannich, Beauly, Scotland, IV4 7LY, with help@bookzenvo.com as the contact address.
- The official Companies House record was rechecked on 27 September 2026 and showed BOOKZENVO LTD (SC902170) as an active private limited company at the same registered office. Recheck if a filing changes or launch is materially delayed.
- A production audit fails if the legal operator name, legal form or service address is not published.
- The production launch audit checked 119 public pages and assets on 27 September 2026 and passed its link and metadata checks.
- The later website pilot passed 120 public pages/assets, the live Pasha booking flow at 390 pixels, signed-in phone-width checks across eight core routes, and Lighthouse mobile scores of 100 for accessibility, best practices and SEO on the homepage and booking page. See [`website-pilot-evidence-2026-09-27.md`](./website-pilot-evidence-2026-09-27.md).
- Consultation and patch-test answers are isolated behind the authenticated server boundary; signed wording and evidence are immutable.
- Health-data agreement is a separate affirmative step. Withdrawal is recorded and visible.
- Customer exports include profile, booking, payment, review, consultation, patch-test, consent and signature records.
- Confirmed erasure removes consultation/patch-test data and signatures, scrubs booking/payment identity, removes matched notifications and photos, and preserves only de-identified operational/financial records.
- Pending rights requests show their receipt date and one-month response deadline.
- Necessary-only browser storage is documented; no advertising or analytics tracker was found in the reviewed source.

## Owner must complete before public launch

- Assemble and review the grant award, submitted application, approved budget, conditions and variations. Record eligible-spend, procurement/card, match-funding, reporting, IP, publicity and London conference obligations.
- Add VAT and ICO numbers only where applicable and verified; do not infer either registration from the Companies House record.
- Re-run `npm run audit:launch -- https://bookzenvo.com` after the final production deployment and do not waive failures. The 27 September 2026 run passed all 119 checked public pages and assets.
- Confirm the privacy notice reflects the actual production hosts, regions, subprocessors, email flows, payment setup and AI features.
- Choose and document retention periods by record type. Configure provider backup expiry consistently; do not keep data merely because storage is available.
- Establish a secure identity-check and delivery method for access requests. Record extensions, refusals, restrictions and legal holds outside the product until dedicated workflow support exists.
- Preserve the completed bundled-asset inventory and generator evidence, record every future public asset before publishing it, and maintain a notice-and-takedown channel for user uploads.
- Complete the contributor/IP ownership chain for founder, collaborator, contractor and pre-incorporation work before asserting that BOOKZENVO LTD owns the code and brand assets.
- Activate and prove each enabled production provider with end-to-end evidence, including Stripe, Twilio, Resend/domain email, Supabase backups and Storage, Cloudflare deployment controls and any enabled AI or calendar provider.
- Complete a physical salon pilot on real mobile devices and retain a signed go/no-go record for the exact release.
- Perform production keyboard, 200%/400% zoom, screen-reader and colour-contrast checks.

## ICO / data-protection actions

- The official ICO fee self-assessment was completed on 27 September 2026 and returned Tier 1 at £52 (£47 with the stated direct-debit discount). Registration and payment remain outstanding; see [`ico-fee-assessment-2026-09-27.md`](./ico-fee-assessment-2026-09-27.md).
- Maintain records of processing, controller/processor instructions, subprocessor contracts, international-transfer safeguards, a breach plan and a data-protection impact assessment for special-category processing where required.
- Confirm each salon understands that it normally controls its client, booking and health data and must identify both an Article 6 basis and an Article 9 condition.

## Qualified solicitor review

- Verify the operator disclosure, contracting entity, legal form, address and all company/VAT disclosures.
- Review the business subscription contract, data-processing terms, liability caps/exclusions, renewal/cancellation/refund terms and marketplace role split.
- Review salon-facing consultation wording, children/guardian handling, consumer pre-contract information and the circumstances in which a health or signature record may be restricted instead of erased.

## Primary guidance used

- [ICO: special-category processing conditions](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/)
- [ICO: responding to a subject access request](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/what-should-we-consider-when-responding-to-a-request/)
- [ICO: data-protection fee](https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/)
- [GOV.UK: company information on websites and stationery](https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material)
