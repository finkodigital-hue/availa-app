# Production deployment

Cloudflare owns Bookzenvo's live runtime variables and secrets. They are kept
in the Worker dashboard, not committed to Git. The Worker configuration uses
`keep_vars` so a deployment preserves those dashboard-managed values.

## Notification delivery setup

Apply `supabase/migrations/20260908120000_add_notification_delivery.sql` before
deploying the application change. It creates server-only notification
preferences and delivery-history tables and adds owner alerts for signed
consultations, low stock and failed booking payments.

Keep these values in Cloudflare's encrypted production secrets (never as
`VITE_` variables):

- `RESEND_API_KEY` — existing outbound email credential.
- `RESEND_WEBHOOK_SECRET` — signing secret for a Resend webhook targeting
  `https://bookzenvo.com/api/resend-webhook`. Subscribe it to delivered,
  failed and bounced email events.
- `CRON_REMINDER_SECRET` — existing reminder sweep secret, matching Supabase
  Vault's `cron_reminder_secret`.

`APP_ENV=production` remains the explicit live-delivery switch. Preview and
local environments should leave it unset; messages will be recorded as
suppressed unless a test-only `EMAIL_OVERRIDE_TO` is configured.

## Normal release

Merge the approved pull request into `main`. Cloudflare will build and deploy
the new commit automatically. Confirm the deployment shows the intended commit,
then run:

```bash
npm run verify:production
```

## If Cloudflare's Git build is delayed or unavailable

From an up-to-date local `main` checkout:

```bash
npm run build
npx wrangler deploy
npm run verify:production
```

Do not add `.env` or any API key to Git. The manual deployment uses the same
Cloudflare Worker and preserves its dashboard-managed runtime variables.

## Incident response

If the production check fails, do not merge further feature changes. Check the
latest Worker deployment in Cloudflare, use the most recent successful
deployment as the rollback target, and tell affected customers through the
support channel while it is being restored.

The GitHub **Production uptime** workflow runs this same check every 15
minutes. The repository owners should keep GitHub Actions failure notifications
enabled. Use the public `/status` page to post and close a customer-facing
incident notice.
