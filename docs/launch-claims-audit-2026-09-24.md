# Public claims audit — 24 September 2026

This is a code-to-copy check, **not** a launch approval. The homepage and FAQ describe a planned product while sign-up directs visitors to a waitlist. Source files show that a feature has been implemented, not that its production providers, data, customer journeys or legal basis have been verified. Keep the launch-scope and final live-audit tasks open in `TASKS.md`.

| Public promise | Code evidence | Proof needed before advertising as live |
| --- | --- | --- |
| Online booking and no-clash diary | `src/lib/public-booking.functions.ts`; booking schedule regression suite | Fictional end-to-end booking, staff/time-zone check, cancel and reschedule on desktop and phone. |
| Deposits, online payment, balances and refunds | `src/routes/_authenticated/payments.tsx`; payment recovery/refund regression suites | Stripe sandbox journey including SCA, expiry, webhook retry and refunds; then a founder-approved live check. A connected physical card reader is **not** supported; the FAQ says so. |
| Confirmation, reminder and follow-up messages | `src/routes/api/bookings/send-confirmation.ts`; `src/routes/api/cron/send-reminders.ts` | Confirm provider configuration, controlled QA inbox/phone delivery, suppression, consent and retries. The cron route existing alone does not prove scheduled production delivery. |
| Consultation forms and patch-test records | `src/lib/consultations.functions.ts`; `src/routes/_authenticated/consultations.tsx` | Fictional customer/staff journey and specialist review of sensitive-data handling and form wording. |
| Verified reviews and review requests | `src/routes/api/reviews/submit.ts`; `src/lib/emails/review-request-email.server.ts` | Genuine-customer provenance, QA request/submit/moderation journey and compliance review before public ratings are relied on. |
| AI assistant, page editing and stock-photo scanning | `src/routes/api/chat.ts`; `src/routes/api/stock-scan.ts` | Provider keys, cost limits, real-model tests, human review of suggestions and plan gating. The assistant returns an error if its model key is missing. |
| Studio customer portal | `src/routes/portal.*.tsx` | Controlled identity, cross-salon isolation and customer actions on a disposable account. |
| Import and export | `src/routes/_authenticated/import.tsx`; `src/lib/import/` | Dry-run a fictional import/export; validate duplicate handling and permissions. Never use imported testshop contacts for QA messages. |
| Free Solo and £22/month Studio | Homepage/FAQ; `src/lib/billing.functions.ts` uses a Stripe price lookup key | Confirm live Stripe price, taxes, subscription emails and final founder-approved plan scope. Homepage already labels this **planned launch pricing**; FAQ should not imply the price is live before that check. |

## Copy decisions before launch

1. Decide the minimum launch scope with the founders. If SMS, AI, reviews or another feature is not ready, remove or explicitly qualify its homepage, metadata, pricing and FAQ promise together.
2. Keep the existing card-reader limitation prominent; online Stripe payments do not imply Stripe Terminal support.
3. Recheck every claim against the exact deployed commit and provider settings. Local builds and fictional regression suites are supporting evidence, not a substitute for the controlled journeys above.
