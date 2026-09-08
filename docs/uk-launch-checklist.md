# Bookzenvo UK launch checklist

Status date: 8 September 2026. This is a practical engineering hand-off, not legal approval.

## Engineering completed

- Public privacy, platform terms, cookie, refund and verified-review policies are routed and linked.
- A production audit fails if the legal operator name, legal form or service address is not published.
- Consultation and patch-test answers are isolated behind the authenticated server boundary; signed wording and evidence are immutable.
- Health-data agreement is a separate affirmative step. Withdrawal is recorded and visible.
- Customer exports include profile, booking, payment, review, consultation, patch-test, consent and signature records.
- Confirmed erasure removes consultation/patch-test data and signatures, scrubs booking/payment identity, removes matched notifications and photos, and preserves only de-identified operational/financial records.
- Pending rights requests show their receipt date and one-month response deadline.
- Necessary-only browser storage is documented; no advertising or analytics tracker was found in the reviewed source.

## Owner must complete before public launch

- Set and verify `VITE_LEGAL_OPERATOR_NAME`, `VITE_LEGAL_OPERATOR_FORM`, `VITE_LEGAL_OPERATOR_ADDRESS`, and the public contact email. Add company number and registration jurisdiction, VAT and ICO numbers where applicable.
- Run `npm run audit:launch -- https://bookzenvo.com` against the final production deployment and do not waive failures.
- Confirm the privacy notice reflects the actual production hosts, regions, subprocessors, email flows, payment setup and AI features.
- Choose and document retention periods by record type. Configure provider backup expiry consistently; do not keep data merely because storage is available.
- Establish a secure identity-check and delivery method for access requests. Record extensions, refusals, restrictions and legal holds outside the product until dedicated workflow support exists.
- Maintain evidence of licences/permissions for every bundled photograph, font, icon and marketing asset, plus a notice-and-takedown channel.
- Perform production keyboard, 200%/400% zoom, screen-reader and colour-contrast checks.

## ICO / data-protection actions

- Complete the ICO fee self-assessment and pay/register if required.
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
