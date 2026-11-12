# Refund recovery review — 12 November 2026

Confirmed defect: `reconcileFailedBookingPayments` treated provider refund status `requires_action` as ordinary pending, leaving `manual_review=false`. Its next sweeps would repeatedly check a refund needing intervention. The signed webhook and normal owner refund flow already recognised this state, but unfulfilled-booking recovery refunds are intentionally handled by the separate durable recovery process.

The reconciler now treats failed, canceled and requires_action consistently: retain the refund identifier, set manual review, leave the issue unresolved, record a failed/review outcome and stop automatic retry selection. It never marks these states refunded. Ordinary pending refunds still remain eligible for verification. This does not itself complete a refund: an operator must inspect the saved issue and the provider's requested action.

Stripe documents `requires_action` as a supported refund status and `next_action` as the instructions needed to proceed: [Stripe Refund object](https://docs.stripe.com/api/refunds/object), checked 12 November 2026. No live Stripe calls were made for this change.

Validation: added fictional canceled/requires_action cases to the existing actual-reconciler test. The requires_action case failed before the change (failed count 0 instead of 1), then passed after it. All 18 payment-recovery assertions and 30 fictional signed refund-webhook assertions pass. No real money or messages.

Further complete SQL source reads: `20260923003000_payment_recovery_backoff.sql`, `20260924003000_payment_ledger_integrity.sql`, `20260924004000_gift_purchase_refunds.sql`. Also read `src/lib/refund-balances.ts` and the complete portal sign-in route `src/routes/portal.index.tsx`. The existing full-schema suites cover redemption/refund identity, negative amounts, currency and retries; these checks are not a substitute for testing a physical reader or observing hosted provider configuration.

This change requires only the normal web release; no additional migration. It sits after the two booking fixes in this audit branch, which do require migrations before their web callers are released.
