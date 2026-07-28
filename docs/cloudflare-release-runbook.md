# Cloudflare release runbook

This is the fallback when a GitHub-triggered Cloudflare build is delayed or fails. It deploys the exact code currently checked out on the computer, without replacing the live secrets and environment settings configured in the Cloudflare dashboard.

## Before releasing

1. Confirm the intended branch and commit are checked out:

   ```powershell
   git status
   git log -1 --oneline
   ```

2. Run the safe local checks:

   ```powershell
   npm run build
   npm run verify:production
   ```

   `build` must finish successfully. `verify:production` checks that the public homepage and its live client bundle can load.

## Preferred release path

Push/merge to `main` and let Cloudflare's Git integration deploy it. In the Cloudflare Workers dashboard, confirm the newest deployment is based on the same short commit shown by `git log -1 --oneline`.

## Manual fallback

If the Git deployment is stuck or failed, run this from the repository root (`availa-app`):

```powershell
npm run deploy:cloudflare
```

The command builds the application and runs Wrangler with `--keep-vars`. That flag is important: it retains the production variables and secrets already stored in Cloudflare, including Supabase, Stripe and Resend configuration.

For a non-live validation first, use:

```powershell
npm run deploy:cloudflare:dry-run
```

If Wrangler asks you to sign in, use the Cloudflare account that owns the `availa-app` Worker. Never paste any secret into Git or into `wrangler.jsonc`.

## After every release

1. Run `npm run verify:production` again.
2. Open `https://bookzenvo.com`, sign in, and open `/book/testshop` (or another test shop) to make sure both the dashboard and a public booking page render.
3. In Cloudflare, record the deployed version/commit if there was an incident.

## When the live site is unavailable

1. Check the scheduled **Production uptime** GitHub Action. It runs every 15 minutes and fails if the homepage or client bundle cannot load. Enable GitHub notifications for the repository so a failed run notifies the team.
2. Check the Cloudflare status page and the Worker deployment log.
3. If the newest deployment caused the problem, use Cloudflare's Worker rollback controls to return to the previous known-good version, then run the checks above.
4. Post a short update to customers only if the issue materially affects booking, sign-in, or payments. Include what is affected, the current workaround, and the next update time.

## Guardrails

- Production variables are managed in Cloudflare, not in `.env` or source control.
- Do not change the Worker name, `assets` binding, or `keep_vars` in `wrangler.jsonc` during an urgent release.
- Treat a failed Git deployment as a deployment-provider issue until the local build also fails. A successful `npm run build` plus a successful manual deployment isolates the problem to the Git build path.
