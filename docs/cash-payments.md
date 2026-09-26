# Cash payments

Owners can open an appointment from Calendar, Bookings or Payments, choose **Cash**, and confirm the displayed remaining amount has been received. Existing deposits are deducted. Recording cash does not require Stripe and does not complete or cancel the appointment.

The booking balance and a succeeded cash charge in `payments` are committed in one database transaction. Payment history shows the method, amount, currency and time; the ledger records the owner's user ID. Existing booking-based collected/outstanding totals include cash automatically. Online refunds use only the card ledger balance; returning physical cash is not implemented by this change.

The server requires the business owner, matching the existing balance-collection permission. The database checks ownership again, locks the balance using the same lock as Stripe/gift cards, verifies the amount and currency, and rejects cancelled/refunded bookings. An active or uncertain card checkout must be resolved before cash can be recorded. Repeated confirmation requests cannot add the payment twice.

## Release

Apply `supabase/migrations/20260926001000_cash_booking_payments.sql` before deploying this branch. Cloudflare code deployment does not apply database migrations. Existing payment rows default to `card`; the migration preserves existing balances and ledger rows. Then deploy the application and check an unpaid booking and a booking with a deposit in a test workspace.

## Verification

- `npm run build` includes type checking, the launch checks and complete migration replay, including cash security/balance assertions.
- `node scripts/test-balance-checkout-ui.mjs` exercises the card flow and cash confirmation/cancel/error/retry paths with mocked requests.

No live cash transactions or Stripe charges are created by these checks.
