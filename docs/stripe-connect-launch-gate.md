# Stripe Connect launch gate

New connected accounts use direct charges with Stripe collecting verification
requirements and the merchant receiving a full Stripe Dashboard. The requested
controller properties are fees payer `account`, payment losses `stripe`,
requirement collection `stripe`, and dashboard `full`.

This implements the configuration proposed in the 25 November 2026 meeting. It
does not constitute written approval of commercial terms, revenue sharing, reader
subsidies or a guarantee that Bookzenvo can never incur losses. Bookzenvo remains
responsible for its own platform balance and its contractual obligations.

## Release safety

- Keep the existing test key in the production website until the deliberate live
  rollout. No live key or account configuration is changed by deploying this code.
- `ENABLE_STRIPE_LIVE_ONBOARDING` defaults to disabled. A live server key alone
  cannot create an account or an onboarding link. The flag must be exactly `true`.
- This flag controls **onboarding only**. It is not a global charges kill switch;
  refunds, webhook recovery and existing payment paths are unchanged.
- Existing test Express accounts keep their current IDs and payment histories.
- Existing live accounts must match the intended controller settings before an
  onboarding link is issued. Legacy Express accounts require a reviewed migration
  plan: never overwrite their account IDs or discard their ledger.
- Account association and status refresh save only if the business still belongs
  to the requesting owner and its account link has not changed. Zero-row saves
  fail instead of issuing a success response or an orphan onboarding link.
- The payment settings screen reads the server's key mode through an owner-only
  endpoint. Test readiness is explicitly labelled as test payments, with no real
  money movement. No key material is returned to the browser.
- New-account requests use a versioned, business-specific idempotency key. A failed
  local save can retry without requesting another account within Stripe's retention
  window. Investigate an ambiguous creation failure before retrying after that window.

## Connected account lifecycle notifications

After deploying, ensure the existing Connect webhook subscribes to `account.updated`
and `account.application.deauthorized` while preserving its payment/refund events.
Signed events are mode- and account-bound. The handler rereads current Stripe state
and only revokes readiness, preserving account links and payment records. Provider
outages are retried; duplicate/delayed events cannot re-enable payments. The owner's
status refresh restores readiness after restrictions are resolved.

## Acceptance still required

Before enabling live onboarding, obtain written confirmation of the Connect model,
applicable fees and liability; verify account creation and onboarding with a new
test merchant; check connected-account webhooks, checkout, refunds and reconciliation;
then authorise the live release and give Stripe the agreed advance notice. Existing
test data must not be relabelled as live. Physical Terminal and Tap to Pay require
their own supported hardware/device and payment acceptance tests.

References: [Stripe controller properties](https://docs.stripe.com/connect/migrate-to-controller-properties)
and [Stripe risk management](https://docs.stripe.com/connect/risk-management).
