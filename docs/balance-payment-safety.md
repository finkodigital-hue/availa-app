# Balance payment safety — 23 September 2026

## Behaviour

Collect balance now opens customer-approved Stripe Checkout. It does not automatically charge the first card attached to a customer matched by email/phone. The compatibility saved-card function cannot charge anything, and new appointment checkouts no longer request off-session card reuse. Existing cards already held by Stripe are not deleted by this release.

One private database attempt records the amount, currency, connected account, return address and email used to create a balance checkout. Repeated application requests share its Stripe idempotency key and identical parameters. A saved session is retrieved from Stripe before returning its link. A replayed creation response is also re-fetched because its cached status may predate payment.

- Open, unpaid session: return that same checkout.
- Complete, paid session: reconcile the payment; do not create a second checkout.
- Complete but unpaid/processing, unavailable provider response or inconsistent identity: stop; do not fall back to a new charge.
- Provider-confirmed expired, unpaid session: retire the attempt. A subsequent explicit Collect balance action may create a new one.
- No saved session ID after an uncertain request and 23 hours: require review. Never rotate the key just because its retention period may have elapsed.

The app uses the current tab to avoid mobile popup blocking. Stripe handles the customer's card entry and any bank authentication.

## Database and monitoring

`balance_checkout_attempts` has RLS and is accessible only to the service role. Claim/record/expiry/fulfilment functions also exclude anonymous/authenticated callers. The authenticated server endpoint first identifies the owner's business; SQL independently checks the booking belongs to that business and that it is eligible for collection. Closed businesses, cancelled/refunded bookings and changed active-checkout details stop for review.

Payment fulfilment serialises by booking and payment intent, checks amount/currency and the existing charge's complete identity, and records the ledger and booking update atomically. A failure audit row cannot count as a successful charge. A checkout's saved session and payment intent cannot be substituted on replay. Webhook handling also checks its connected account, business, booking and attempt before fulfilment.

Failed balance fulfilment is recorded in `booking_payment_issues` for manual review, with no automatic refund based on a slot hold. Uncertain old checkout attempts are included in the authenticated monitoring endpoint. Keep unresolved payments visible; do not mark them successful to silence alerts.

## Operator handling

Before replacing a blocked checkout, inspect the exact session and payment intent in the correct connected Stripe account. If a payment succeeded, reconcile it or arrange an authorised refund; never ask the customer to pay again because the website did not update. Confirm an unpaid session has expired before retiring its database attempt. Record the evidence and decision. Do not merely clear the review flag or generate another key.

Earlier checkout links and off-session PaymentIntents created before this release must be reviewed separately before live launch. A price/currency/account change, cancellation or manual payment while a checkout is already open can require manual reconciliation. This release does not certify those operational scenarios or permit automatic saved-card charging. Re-enabling off-session collection requires verified customer consent, correct customer/card ownership, a durable shared attempt and a tested SCA/timeout/recovery process.

## Verification and outstanding gates

50 new isolated assertions execute the actual migration and application helper with fictional provider responses. They cover access control, immutable retry parameters, competing application requests, provider expiry, unknown outcomes, completed payments, cross-booking identity, currency/amount/session mismatch, failure rows and cascade cleanup. They are not a real Stripe/SCA journey, a multiple-database-connection concurrency test or a complete schema replay. The full release suite now contains 200 assertions.

No live or sandbox card was charged by these tests. The integrated sandbox journeys, legacy-provider review and final founder-present real-card test remain launch gates.

Primary references checked: [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests) (same parameters and keys retained for at least 24 hours), [Checkout Session state](https://docs.stripe.com/api/checkout/sessions/object) (open/complete/expired and separate payment status). Application retries stop at 23 hours when no session ID is known, leaving a margin before key pruning.
