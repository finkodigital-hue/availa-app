# Daily takings

Payments opens on **Daily takings**; the previous balances and Stripe refund controls remain under **Booking payments**.

The selected date uses the business timezone and receipt timestamps, independently of appointment dates or booking cancellation. The view includes succeeded charges and refunds, and paid gift-card purchases and provider-confirmed gift-card refunds. Redemption and complimentary gift-card issue are not new receipts. Totals remain separate for each currency. Cash/card/method breakdowns are net of refunds; Total received is gross receipts and Net takings subtracts refunds. These figures are before processing fees, not bank payout amounts.

Owners can record received cash, external-terminal card payments, bank transfers or other payments against an outstanding booking balance. This only records money already received and never charges a card. Partial payments allow different methods for the same booking. The server resolves the owner’s business, and a service-role-only RPC locks the booking, validates its remaining balance, and writes both receipt and balance atomically. A unique request key protects retries.

New walk-in bookings created with money already paid get an unclassified receipt; the owner can choose its method in Daily takings. Previous manual payments and CSV imports have no reliable receipt date or method and are not backfilled. Existing Stripe transactions remain visible. Online Stripe receipts cannot be reclassified through this feature. Manual refunds and backdated receipt entry are not added by this change; the existing Stripe refund flow remains available.

## Release

Apply `supabase/migrations/20260927120000_daily_takings.sql` and `20260927121000_daily_takings_gift_refunds.sql` before releasing the app build. The migration extends the existing payment-method constraint while preserving the card default and all existing cash entries, adds a unique recording key, a receipt trigger for new walk-in bookings, and three service-role-only RPCs. It does not rewrite historical amounts or payment dates. The app shows an error rather than zero takings if the migration is missing or the request fails. This feature is owner-only, matching the existing Payments access policy. Reports retains its existing reports.read permission and uses the same dated ledger, including other/unclassified methods.

Manual receipts share the existing balance advisory lock with cash/Stripe/gift-card flows. Active or uncertain card checkouts block another payment method. The RPC also checks deletion state, currency and refund state. The original balance checkout and Stripe refund controls remain intact under Booking payments.

## Validation

- Production build and security-boundary check pass.
- Focused lint passes for new TypeScript and the regression script.
- `node scripts/test-schema-replay.mjs` replays all 158 migrations and includes `schema-daily-takings-checks.mjs`: split receipts, retry identity, invalid amounts/actors, currency checks, active/review checkout conflicts, initial receipts, cancelled bookings, 23/25-hour local days, 1,200 receipts and RPC permissions. Existing full-schema cash, gift-card, Stripe/refund and access suites also pass.
- Browser component tests with labelled sample data cover desktop/mobile layout, classifying a receipt, recording a partial payment, overpayment prevention and empty/error states. They do not exercise live authentication or a hosted database.
- Repository-wide type-checking and the current full launch-check suite pass.

Release verification is recorded separately after deployment.

