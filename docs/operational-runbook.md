# Operational Runbook

This runbook covers Kaiplan production operations that are controlled from this
repository. Keep live secret values out of git.

## Owners and Incident Contact

- Primary owner: Angel Campa
- Incident inbox: `angel.campa@kaiplan.app`
- Production surfaces:
  - API Worker: `kaiplan-api` at `https://api.kaiplan.app`
  - Dashboard Worker: `kaiplan-app` at `https://my.kaiplan.app`
  - Marketing/Web Worker: `kaiplan-web` at `https://kaiplan.app`

During an incident, first identify the affected surface, check the latest
Cloudflare deployment, Sentry issue, and Stripe/Neon/Resend status as relevant,
then either roll forward with a fix or roll back the affected deployment.

## Secret Rotation

Use `docs/production-env-vars-step-by-step.md` as the source of truth for which
values are required and where they are set.

General rotation sequence:

1. Create the replacement secret in the upstream provider.
2. Set the replacement value with `wrangler secret put` for the affected
   project, or update the public build variable in the project config.
3. Deploy the affected project.
4. Verify the affected flow in production.
5. Revoke the old provider secret after the new value is confirmed.

Service notes:

- Better Auth: rotate `BETTER_AUTH_SECRET` during a planned maintenance window.
  Existing sessions may be invalidated; verify sign-in, sign-up, password reset,
  and Google OAuth afterward.
- Stripe: rotate `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` separately.
  After webhook secret rotation, send a Stripe test webhook and verify the API
  accepts it before removing the old endpoint secret.
- Resend: rotate `RESEND_API_KEY`, then send a password reset or RSVP test email
  from production.
- Google OAuth: create a new OAuth client secret, update
  `GOOGLE_CLIENT_SECRET`, verify Google sign-in, then delete the old secret.
- Neon: rotate database credentials by creating a replacement role or password,
  update Hyperdrive or `DATABASE_URL`, deploy, verify `/api/health`, then revoke
  the old credential.
- Sentry/PostHog/Apollo/Sequencer optional secrets: rotate in the provider,
  update the relevant Worker secret, deploy the affected project, and verify the
  related telemetry or integration path.

## Deploy Procedure

Before deploying, run the full local gate:

```powershell
pnpm run verify
```

Deploy only touched projects when possible:

```powershell
pnpm run deploy:touched
```

Explicit deploy commands:

```powershell
pnpm run deploy:api
pnpm run deploy:app
pnpm run deploy:web
```

The web deploy uploads and verifies lead-magnet PDFs before building and
deploying the Cloudflare Worker bundle.

### `deploy:api` requires an explicit `DATABASE_URL`

`deploy:api` runs `db:migrate:prod`, which by design reads the production
`DATABASE_URL` only from the shell environment and refuses any `.env.local`
fallback (`apps/api/scripts/database-env.ts`). Do **not** set `DATABASE_URL` as a
permanent OS/user environment variable: the non-production `db:migrate` path also
honors a shell `DATABASE_URL`, so a global value would make local migrations run
against production.

Keep the value in an out-of-repo, user-only secrets file and inject it into the
deploy child process only. On the maintainer's Windows machine this is set up as:

- Secret file: `~/.kaiplan/kaiplan-prod.env` (ACL-locked; `DATABASE_URL=...`).
- PowerShell wrapper `kpdeploy` (in the user's
  `Microsoft.PowerShell_profile.ps1`) loads the secret for one deploy and clears
  it afterward:

  ```powershell
  kpdeploy api      # also: app, web, touched
  ```

- git-bash equivalent: `source ~/.kaiplan/load-prod-env.sh && pnpm run deploy:api`.

See `~/.kaiplan/README.md` for setup and how to replicate on another computer.
The secret value itself is never stored in this repo.

Post-deploy checks:

- `https://api.kaiplan.app/api/health` returns HTTP 200 with JSON status.
- `https://my.kaiplan.app` loads the dashboard shell.
- `https://kaiplan.app` loads the marketing home page.
- Public wedding pages under `/w/<slug>/` still render.
- Signup, login, and the most relevant touched workflow pass a smoke test.

## Rollback Procedure

Cloudflare Workers:

1. Open the affected Worker in Cloudflare.
2. Select the last known-good deployment/version.
3. Roll back traffic to that version.
4. Verify the affected host and Sentry error rate.
5. Record the rollback reason in the incident notes.

Cloudflare Pages/Workers-style web deploys:

1. Roll back `kaiplan-web` to the last known-good deployment in Cloudflare.
2. If lead-magnet PDFs were part of the incident, compare the R2 object hashes
   against `apps/web/public/lead-magnets/manifest.json`.
3. If R2 PDF objects are missing or corrupted but Worker traffic is healthy,
   check out the last known-good revision and re-upload only the lead-magnet
   PDFs with `pnpm exec tsx scripts/deploy-lead-magnet-pdfs.ts`.
4. If the web code and R2 objects both need rollback, check out the last
   known-good revision and run `pnpm run deploy:web` so the Worker deployment,
   generated PDFs, and R2 manifest are restored together.
5. Re-run `pnpm --filter @kaiplan/web run build:pdfs` first if the checked-out
   revision does not already have fresh files in
   `apps/web/public/lead-magnets/`.
6. Verify `https://kaiplan.app`, key resource pages, and `/free/<slug>` flows,
   including an actual lead-magnet download.

Database:

- Prefer forward fixes or reversible migrations.
- Do not run destructive manual SQL during an incident without first exporting
  the affected rows.
- Neon point-in-time restore dry-runs are tracked separately in
  `docs/production-readiness.md` and must be verified against the live project.

Old-site removal:

- Confirm DNS and custom domains point to the current Cloudflare projects before
  deleting any stale Pages project.
- Use `pnpm run cloudflare:cleanup-marketing -- --project <stale-pages-project>`
  only with an explicit stale project name.

## Status Page

Kaiplan does not currently operate a separate public status page. Until one is
configured, use the marketing site and `angel.campa@kaiplan.app` for user-facing
incident communication. A dedicated status page remains a launch-readiness item.
