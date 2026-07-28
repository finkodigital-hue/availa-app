# Production deployment

Cloudflare owns Bookzenvo's live runtime variables and secrets. They are kept
in the Worker dashboard, not committed to Git. The Worker configuration uses
`keep_vars` so a deployment preserves those dashboard-managed values.

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
