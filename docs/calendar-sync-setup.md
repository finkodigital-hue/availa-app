# Calendar sync deployment setup

The application code and database schema are ready, but provider connections stay disabled until real provider-console credentials are supplied. Never put these values in a `VITE_` variable.

## Shared secrets

Generate two independent, high-entropy values:

- `CALENDAR_OAUTH_STATE_SECRET` signs the short-lived OAuth state binding a callback to the owner and business.
- `CALENDAR_SYNC_SECRET` authenticates calls from the database outbox worker to the internal sync route.

Store both as encrypted Cloudflare Worker secrets. Store the same `CALENDAR_SYNC_SECRET` value in Supabase Vault under the name `calendar_sync_secret`.

## Google Cloud

Enable Google Calendar API, configure the OAuth consent screen, and create a Web application OAuth client. Add this exact production redirect URI:

`https://bookzenvo.com/api/calendar/google/callback`

Store the issued values as `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`. Request production verification for the Calendar events scope before enabling the feature broadly.

## Microsoft Entra

Create an app registration that accepts the desired organisational accounts (the current route uses the `common` authority). Add this Web redirect URI:

`https://bookzenvo.com/api/calendar/microsoft/callback`

Add delegated Microsoft Graph permission `Calendars.ReadWrite`, grant consent as required for the tenant, and store the issued values as `MICROSOFT_CALENDAR_CLIENT_ID` and `MICROSOFT_CALENDAR_CLIENT_SECRET`.

## Database scheduling

Apply all migrations. Confirm `pg_cron`, `pg_net`, and Vault are available, the `dispatch-calendar-sync` job is active, and the `calendar_sync_secret` Vault entry exists. The outbox retains failed work and retries with backoff; successful processing removes its row.

## Deliberate first-release boundary

Bookzenvo is the source of truth. It pushes booking creates, moves, edits, and cancellations outward. It does not import arbitrary provider events because a shared salon event cannot safely be assigned to a staff member; treating it as business-wide busy time would create false clashes. A private Apple-compatible subscription feed is also deferred until a revocable feed-token workflow is added. Customer `.ics` downloads and email attachments remain supported independently.
