# In-salon card payments: implementation plan

Status: proposal only (24 September 2026). No Terminal integration, reader, or live account configuration is in place.

## Recommendation

Build a web-first pilot for a **server-driven, internet-connected Stripe smart reader** on a UK salon's connected account. Start with one simulated reader and fictional booking in a Stripe sandbox, then a supervised physical-reader pilot. Keep the existing secure online balance link as a fallback. Do not advertise Tap to Pay or support for a salon's existing Fresha terminal as part of this first release.

Stripe currently lists WisePOS E and Stripe Reader S700/S710 in GB. Its server-driven flow is recommended for those readers and uses server API calls, which fits Bookzenvo's web app. Tap to Pay is available in GB, but Stripe requires an iOS/Android or React Native Terminal SDK integration; iPhone also requires Apple entitlements and app approval. A website alone does not provide native Tap to Pay. UK Terminal transactions must be in GBP, and the account receiving funds and reader location must be in the same country. Recheck hardware availability and pricing with Stripe before purchase. [UK availability and rules](https://docs.stripe.com/terminal/payments/regional?integration-country=GB), [server-driven flow](https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=server-driven), [Tap to Pay on iPhone](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay.md?platform=ios).

## Bookzenvo fit

- `src/lib/stripe-connect.functions.ts` and `src/lib/balance-checkout.server.ts` already create online Stripe Checkout sessions as **direct charges on each salon's connected account** (`Stripe-Account` header).
- `src/routes/api.stripe-webhook.ts` handles connected-account Checkout and refund events. `supabase/migrations/20260923004000_balance_checkout_safety.sql` records a verified balance payment in the `payments` ledger and updates the booking amount due. Terminal must have a separate, equally strict fulfilment path; a `checkout.session.completed` event will not occur for a Terminal PaymentIntent.
- `src/routes/_authenticated/payments.tsx` and booking views show existing payment state. The amount offered to a reader must be computed server-side from the booking's current due amount and currency, never trusted from the browser. A prior deposit, gift-card redemption, online balance link, refund, or booking edit can change what is due.

## Proposed flow

1. An authorised salon staff member opens a booking and chooses **Take card payment**. Show the amount due, prior payments, and which reader is selected. Gate the feature until the salon's connected account can charge, its GB Terminal location and reader are registered, and the booking/currency are eligible.
2. In one server-side transaction, lock/recheck the booking's current due amount and create a persistent in-person payment attempt with booking ID, business ID, connected-account ID, reader ID, amount, currency, status, and a unique idempotency key. Allow at most one active card attempt per booking/amount; guard against a simultaneous online balance checkout.
3. Create a `card_present` PaymentIntent **on that same connected account**, using an idempotency key and metadata linking to the attempt and booking. For the initial pilot, use automatic capture to keep the flow simple; decide separately whether manual capture is needed. Never create a second PaymentIntent on a timeout without first retrieving the existing one.
4. Send the PaymentIntent to the reader via `process_payment_intent`. The initial HTTP acknowledgement means only that the reader received the action, **not that the customer paid**. Display an in-progress state and allow a safe status refresh/cancel path.
5. Verify Stripe's signed **Connect** webhook and account identity. On `payment_intent.succeeded`, retrieve/validate the PaymentIntent as necessary, then atomically and idempotently add a `payments` ledger charge and update booking due/status. Use `terminal.reader.action_succeeded`/`action_failed` to update operator-facing reader state; do not treat reader-action success alone as proof of captured funds. Handle duplicate/out-of-order webhooks and reconcile missed events by querying the connected account. Never mark paid optimistically.
6. On decline, cancellation, reader offline/busy, or timeout, explain the state clearly and offer retry on the *same eligible PaymentIntent* or the existing online payment link. Do not let a second staff device charge the same booking concurrently. Existing refund logic should locate the Terminal charge in the common ledger; verify its event/charge behavior in a sandbox before enabling refunds.

Stripe says server-driven processing is asynchronous, recommends reader-action webhooks with polling as a fallback, and says to reuse a PaymentIntent after a decline to avoid double charges. The server-driven flow does **not** support offline card payments. [Collect card payments](https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=server-driven).

## Implementation slices

1. **Correct product wording now:** explain that online payment links work today, but Bookzenvo does not yet connect a card reader or support tap-on-phone. A payment taken on an external machine does not automatically update Bookzenvo's booking or payment ledger.
2. **Sandbox vertical slice:** explicit database migration for reader mappings and payment attempts, server endpoints for start/status/cancel, a minimal booking checkout panel, connected-account Terminal webhook handlers, and reconciliation. Add tests for auth/business isolation, amount calculation, retries, duplicate events, payment-link races, deposits, refunds, and reader errors. Stripe supports simulated server-driven readers (`simulated-wpe`, `simulated-s700`, `simulated-s710`) in a sandbox. [Simulated reader](https://docs.stripe.com/terminal/payments/connect-reader?reader-type=simulated&terminal-sdk-platform=server-driven).
3. **Pilot and rollout:** test one physical GB reader with one consenting salon, including PIN/SCA fallbacks, connection loss, refunds, receipts, end-of-day reconciliation, and staff training. Start behind a business-level feature flag. A UK contactless card can require insertion/Chip-and-PIN; a smart reader or online link is a useful fallback. [UK considerations](https://docs.stripe.com/terminal/payments/regional?integration-country=GB).

## Release gates / unresolved decisions

- Confirm Stripe Terminal access and the precise Connect charge/fee model for Bookzenvo's connected accounts. Reader, location, PaymentIntent, and webhook account must match; do not mix platform and salon objects. Existing direct-charge approach is the design assumption, not a verified live capability for every salon.
- Decide whether tips, split tender, cash, gift-card balances, and walk-in sales belong in v1. Recommend **booking balance only**, no tips or split tender initially. In the UK, Stripe's server-driven guide marks on-receipt tips as US-only, so do not promise that flow.
- Confirm payment amount minimums, receipt handling, refund and dispute ownership, hardware purchase/support costs, and terms before announcing pricing.
- No live charge, real-customer test, production migration, or hardware purchase should happen from this plan alone. The test sequence requires an isolated Stripe sandbox and fictional booking data; it does not require Docker.

## Sources checked

- [Stripe Terminal UK regional considerations](https://docs.stripe.com/terminal/payments/regional?integration-country=GB)
- [Stripe server-driven card collection](https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=server-driven)
- [Stripe simulated server-driven reader](https://docs.stripe.com/terminal/payments/connect-reader?reader-type=simulated&terminal-sdk-platform=server-driven)
- [Stripe Tap to Pay on iPhone](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay.md?platform=ios)
