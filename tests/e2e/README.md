# Browser tests

The suite deliberately exercises pages as a reader. It does not submit booking,
payment, message, signature, deletion, or settings forms. A request guard aborts
known Stripe, email, booking-action, review, and stock-scanner writes.

Run the public and signed-out coverage:

```sh
npm test
```

Run the authenticated workspace coverage with a dedicated non-production test
account and an optional booking-page slug:

```sh
E2E_EMAIL=test@example.com E2E_PASSWORD=... E2E_BOOKING_SLUG=testshop npm test
```

Use only a disposable local/staging account. Never provide production credentials.
The first run may require `npx playwright install chromium`.
