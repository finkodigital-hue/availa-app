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
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` — server-only Twilio credentials.
- `TWILIO_MESSAGING_SERVICE_SID` — preferred SMS sender configuration. If a
  Messaging Service is not used, set `TWILIO_FROM_NUMBER` to an SMS-capable
  E.164 sender number instead.

`APP_ENV=production` remains the explicit live-delivery switch. Preview and
local environments should leave it unset; messages will be recorded as
suppressed unless a test-only `EMAIL_OVERRIDE_TO` is configured.

## Support ticket setup

Apply `supabase/migrations/20260908220000_add_support_ticket_workflow.sql`
before deploying the support UI. It copies the existing feedback and support
requests into a unified ticket queue and creates requester-visible history.

No message-provider setup is required: ticket acknowledgements and operator
replies are displayed inside Bookzenvo, and this change deliberately sends no
external email. Until a dedicated operator console is added, authorised
operators can use Supabase Studio with service-role access:

- Work from `support_tickets`, updating `status` to `in_progress`,
  `waiting_on_customer`, `resolved`, or `closed`. Each status change is added
  to ticket history automatically.
- Add replies to `support_ticket_events` with `actor_type = 'operator'`,
  `event_type = 'reply'`, and `visible_to_requester = true`.
- Add private working notes with `event_type = 'internal_note'` and
  `visible_to_requester = false`. The authenticated owner API always filters
  these out.

Do not grant `anon` or `authenticated` direct access to either support table.
Attachments are intentionally disabled until a private bucket, file-type and
size validation, retention rules, and malware scanning are available.

## SMS reminder setup

Apply `supabase/migrations/20260908200000_add_sms_appointment_reminders.sql`
before enabling SMS. In Twilio, complete any sender registration required for
the destination countries. Bookzenvo supplies a signed delivery-status callback
automatically when `APP_URL` is HTTPS. SMS has no development redirect: outside
production it is always logged as suppressed and no provider request is made.

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
