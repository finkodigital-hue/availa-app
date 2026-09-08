# Browser tests

The suite deliberately exercises pages as a reader. It does not submit booking,
payment, message, signature, deletion, or settings forms. A request guard aborts
known Stripe, email, booking-action, review, and stock-scanner writes.

Run the signed-out shell coverage (no database configuration required):

```sh
npm test
```

Data-backed booking checks are skipped until a safe salon slug is supplied.
Use `pasha-hair` only against the intended pilot environment, after confirming
that its opening hours, services and staff are test-ready:

```sh
E2E_BASE_URL=https://staging.example.com E2E_BOOKING_SLUG=pasha-hair npm test
```

Run the authenticated workspace coverage with a dedicated non-production test
account and an optional booking-page slug:

```sh
E2E_EMAIL=test@example.com E2E_PASSWORD=... E2E_BOOKING_SLUG=qa-studio-salon npm test
```

Use only a disposable local/staging account. Never provide production credentials.
The suite reaches the customer-details step but never clicks the payment/booking
button. It opens owner dialogs but never saves them. It must not be pointed at a
production owner account.
The first run may require `npx playwright install chromium`.
