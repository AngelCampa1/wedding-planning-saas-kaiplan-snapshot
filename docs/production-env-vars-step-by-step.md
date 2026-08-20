# Production Env Vars Step By Step

Use this runbook to collect every production value needed for the Kaiplan live
marketing site, dashboard app, API Worker, and live E2E pass.

Do not paste secrets into chat, Git, screenshots, issue reports, or docs. Put
API secrets into Cloudflare Worker secrets with `wrangler secret put`.

## 1. Fixed Kaiplan URLs

These are not copied from a vendor dashboard. Use exactly these values.

| Variable                      | Value                                               | Where used                    |
| ----------------------------- | --------------------------------------------------- | ----------------------------- |
| `BETTER_AUTH_URL`             | `https://api.kaiplan.app`                           | API Worker plain var          |
| `APP_URL`                     | `https://my.kaiplan.app`                            | API Worker plain var          |
| `PUBLIC_WEB_URL`              | `https://kaiplan.app`                               | API Worker optional plain var |
| `STRIPE_CHECKOUT_SUCCESS_URL` | `https://my.kaiplan.app/subscribe?checkout=success` | API Worker secret             |
| `STRIPE_CHECKOUT_CANCEL_URL`  | `https://my.kaiplan.app/subscribe?checkout=cancel`  | API Worker secret             |
| `STRIPE_PORTAL_RETURN_URL`    | `https://my.kaiplan.app`                            | API Worker secret             |
| `VITE_API_URL`                | `https://api.kaiplan.app`                           | Dashboard build env           |
| `VITE_PUBLIC_SITE_URL`        | `https://kaiplan.app`                               | Dashboard build env           |
| `PUBLIC_API_URL`              | `https://api.kaiplan.app`                           | Marketing Worker var          |
| `PUBLIC_APP_ORIGIN`           | `https://my.kaiplan.app`                            | Marketing Worker var          |

`BETTER_AUTH_URL`, `APP_URL`, and `ENVIRONMENT=production` are already in
`apps/api/wrangler.toml`. The marketing public vars are already in
`apps/web/wrangler.jsonc`.

## 2. Generate Local Secrets

These are generated locally, not copied from a website.

Run this twice and save each output in your password manager:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Use the first output for:

```text
BETTER_AUTH_SECRET
```

Use the second output for:

```text
EMAIL_TOKEN_SECRET
```

Better Auth also documents `openssl rand -base64 32` as a valid way to generate
the auth secret.

## 3. Stripe Values

Open [Stripe Dashboard](https://dashboard.stripe.com/) and make sure the
Live/test toggle is set to the environment you intend to use. For production,
use live mode values.

### Secret Key

1. Go to Developers -> API keys.
2. Copy or create a live mode secret key.
3. Save it as:

```text
STRIPE_SECRET_KEY=sk_live_...
```

Stripe only shows newly created live secret or restricted keys once. Store it
immediately in a password manager.

### Products And Price IDs

Create or open three products under Product catalog:

| Product  | Prices to create/copy     | Kaiplan variable                 |
| -------- | ------------------------- | -------------------------------- |
| Starter  | Monthly recurring, USD 20 | `STRIPE_STARTER_PRICE_ID`        |
| Starter  | Annual recurring, USD 200 | `STRIPE_STARTER_ANNUAL_PRICE_ID` |
| Pro      | Monthly recurring, USD 35 | `STRIPE_PRO_PRICE_ID`            |
| Pro      | Annual recurring, USD 350 | `STRIPE_PRO_ANNUAL_PRICE_ID`     |
| Lifetime | One-time, USD 100         | `STRIPE_LIFETIME_PRICE_ID`       |

For each price:

1. Open the product in Stripe.
2. Open the specific price row.
3. Copy the ID that starts with `price_`.

### Webhook Signing Secret

1. Go to Developers -> Webhooks.
2. Create an endpoint with this URL:

```text
https://api.kaiplan.app/api/billing/webhook
```

3. Subscribe to these events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

4. Open the endpoint and reveal/copy the signing secret.
5. Save it as:

```text
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 4. Cloudflare Images Values (Optional)

Cloudflare Images is optional. The only feature that uses it is the
wedding-website hero image upload, which returns a `503` when these values are
absent. Every other API request works without them, and the production deploy no
longer requires these secrets. Skip this section unless you have an active
Cloudflare Images subscription and want hero uploads enabled.

Open [Cloudflare Dashboard](https://dash.cloudflare.com/) -> Images.

### Account ID

Use the account ID for the Cloudflare account that owns `kaiplan.app`:

```text
CLOUDFLARE_IMAGES_ACCOUNT_ID=REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID
```

### API Token

1. Go to Profile -> API Tokens.
2. Create a custom token.
3. Scope it to the Kaiplan account.
4. Give it the minimum Images permissions needed for direct upload/create
   operations. If you are unsure, use Account -> Cloudflare Images -> Edit.
5. Copy the token once and save it as:

```text
CLOUDFLARE_IMAGES_API_TOKEN=cfut_...
```

Cloudflare only shows API token secrets once.

### Delivery Base URL

Optional, but useful for image rendering:

1. In Cloudflare Images, upload or open any image.
2. In Developer Resources or the image preview URL, copy the account hash from:

```text
https://imagedelivery.net/<ACCOUNT_HASH>/<IMAGE_ID>/<VARIANT_NAME>
```

3. Save:

```text
CLOUDFLARE_IMAGES_DELIVERY_BASE_URL=https://imagedelivery.net/<ACCOUNT_HASH>
```

## 5. Sentry DSNs

Open [Sentry](https://sentry.io/) and use the Kaiplan projects.

For each project, go to:

```text
Project -> Settings -> Client Keys (DSN)
```

Collect:

| Variable            | Project               |
| ------------------- | --------------------- |
| `SENTRY_DSN`        | API/backend project   |
| `VITE_SENTRY_DSN`   | Dashboard app project |
| `PUBLIC_SENTRY_DSN` | Marketing web project |

`SENTRY_DSN` is required by the API in production. `VITE_SENTRY_DSN` is required
when building the dashboard app in production. The marketing DSN is currently
already present in `apps/web/wrangler.jsonc`.

Optional source map upload variables:

| Variable             | Use                             |
| -------------------- | ------------------------------- |
| `SENTRY_AUTH_TOKEN`  | Upload source maps during build |
| `SENTRY_ORG`         | Sentry organization slug        |
| `SENTRY_APP_PROJECT` | Dashboard Sentry project slug   |
| `SENTRY_WEB_PROJECT` | Marketing Sentry project slug   |
| `SENTRY_RELEASE`     | Release identifier              |
| `SENTRY_ENVIRONMENT` | Usually `production`            |

## 6. Email Values

### Required Sender Address

Choose a production sender address:

```text
EMAIL_FROM_ADDRESS=Angel Campa <angel.campa@kaiplan.app>
```

Optional:

```text
EMAIL_REPLY_TO_ADDRESS=angel.campa@kaiplan.app
```

### Resend API Key

This is optional in the env schema, but real email delivery needs it.

1. Open [Resend API Keys](https://resend.com/api-keys).
2. Click Create API Key.
3. Use Sending access and restrict it to the verified `kaiplan.app` domain when
   possible.
4. Copy the key once and save:

```text
RESEND_API_KEY=re_...
```

Make sure the `kaiplan.app` sending domain is verified in Resend before relying
on production email.

## 7. Optional Google OAuth

Only needed if Google sign-in should be enabled.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create the Kaiplan project.
3. Go to APIs & Services -> Credentials.
4. Create an OAuth client ID of type Web application.
5. Add authorized origins:

```text
https://my.kaiplan.app
https://api.kaiplan.app
```

6. Add the Better Auth callback URI used by the API:

```text
https://api.kaiplan.app/api/auth/callback/google
```

7. Copy:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## 8. Optional Turnstile RSVP Protection

Only needed if public RSVP forms should require Turnstile.

1. Open Cloudflare Dashboard -> Turnstile.
2. Create a site for `kaiplan.app`.
3. Copy:

```text
PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
```

4. Enable API enforcement:

```text
PUBLIC_RSVP_REQUIRE_TURNSTILE=true
PUBLIC_RSVP_TURNSTILE_FIELD=turnstileToken
PUBLIC_RSVP_HONEYPOT_FIELD=website
```

If you are not enabling Turnstile yet, keep:

```text
PUBLIC_RSVP_REQUIRE_TURNSTILE=false
```

## 9. Optional Marketing API Values

The marketing Worker embeds `@kaiplan/marketing-api`. These values are only
needed for lead capture, enrichment, analytics, and protected stats endpoints.

| Variable                   | Where to get it                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POSTHOG_API_KEY`          | PostHog project settings                                                                                 |
| `APOLLO_API_KEY`           | Apollo account API key settings                                                                          |
| `STATS_SECRET`             | Generate locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` |
| `FEEDBACK_RECIPIENT_EMAIL` | Email inbox that should receive feedback                                                                 |
| `NURTURE_ENABLED`          | Set to `true` only after email delivery is ready                                                         |
| `INDEXNOW_ENABLED`         | Set to `true` only after IndexNow setup is complete                                                      |

## 10. Set API Worker Secrets

From the repo root, run one command per secret. Paste the value when Wrangler
prompts.

```powershell
pnpm exec wrangler secret put BETTER_AUTH_SECRET --config apps/api/wrangler.toml
pnpm exec wrangler secret put EMAIL_TOKEN_SECRET --config apps/api/wrangler.toml
pnpm exec wrangler secret put EMAIL_FROM_ADDRESS --config apps/api/wrangler.toml
pnpm exec wrangler secret put SENTRY_DSN --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_SECRET_KEY --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_STARTER_PRICE_ID --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_STARTER_ANNUAL_PRICE_ID --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_PRO_PRICE_ID --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_PRO_ANNUAL_PRICE_ID --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_LIFETIME_PRICE_ID --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_CHECKOUT_SUCCESS_URL --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_CHECKOUT_CANCEL_URL --config apps/api/wrangler.toml
pnpm exec wrangler secret put STRIPE_PORTAL_RETURN_URL --config apps/api/wrangler.toml
```

Recommended optional API secrets:

```powershell
pnpm exec wrangler secret put RESEND_API_KEY --config apps/api/wrangler.toml
pnpm exec wrangler secret put EMAIL_REPLY_TO_ADDRESS --config apps/api/wrangler.toml
```

Cloudflare Images secrets are optional (see Section 4). Set them only if you want
the wedding-website hero image upload enabled; otherwise that endpoint returns a
`503` and the rest of the API is unaffected:

```powershell
pnpm exec wrangler secret put CLOUDFLARE_IMAGES_ACCOUNT_ID --config apps/api/wrangler.toml
pnpm exec wrangler secret put CLOUDFLARE_IMAGES_API_TOKEN --config apps/api/wrangler.toml
pnpm exec wrangler secret put CLOUDFLARE_IMAGES_DELIVERY_BASE_URL --config apps/api/wrangler.toml
```

If enabling Google or Turnstile:

```powershell
pnpm exec wrangler secret put GOOGLE_CLIENT_ID --config apps/api/wrangler.toml
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET --config apps/api/wrangler.toml
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --config apps/api/wrangler.toml
```

Cloudflare notes that `wrangler secret put` creates and deploys a new Worker
version. After all secrets are set, redeploy once:

```powershell
pnpm run deploy:api
```

Then verify:

```powershell
pnpm exec wrangler secret list --config apps/api/wrangler.toml --format json
curl.exe -i https://api.kaiplan.app/api/health
```

## 11. Verify Dashboard Worker Vars

The dashboard app build reads public production values from
`apps/app/wrangler.jsonc` Worker vars. Verify those values are set there, then
deploy:

```powershell
pnpm run deploy:app
```

Do not use the API Sentry DSN for the dashboard `VITE_SENTRY_DSN`; use the
dashboard app project DSN.

## 12. Set Marketing Optional Secrets

Most marketing production values are already in `apps/web/wrangler.jsonc`.
Use Worker secrets for optional private values:

```powershell
pnpm exec wrangler secret put POSTHOG_API_KEY --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put APOLLO_API_KEY --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put RESEND_API_KEY --config apps/web/wrangler.jsonc
pnpm exec wrangler secret put STATS_SECRET --config apps/web/wrangler.jsonc
```

Then redeploy:

```powershell
pnpm run deploy:web
```

## 13. Live E2E Account Vars

Use a dedicated paid live E2E user. Store these locally or in the CI secret
store, not in Cloudflare:

```powershell
$env:KAIPLAN_LIVE_E2E="true"
$env:KAIPLAN_LIVE_E2E_EMAIL="<dedicated paid e2e user email>"
$env:KAIPLAN_LIVE_E2E_PASSWORD="<dedicated paid e2e user password>"
```

The account must have Pro or Lifetime access so website publishing and RSVP can
run.

## 14. Final Verification

Run:

```powershell
pnpm exec tsx scripts/validate-cloudflare-api-config.ts
pnpm exec tsx scripts/validate-cloudflare-app-config.ts
curl.exe -I https://kaiplan.app/
curl.exe -I https://my.kaiplan.app/signup
curl.exe -i https://api.kaiplan.app/api/health
$env:KAIPLAN_LIVE_E2E="true"; pnpm run e2e:live
```

Expected:

| Check                                | Expected                                               |
| ------------------------------------ | ------------------------------------------------------ |
| `https://kaiplan.app/`               | HTTP 200                                               |
| `https://my.kaiplan.app/signup`      | HTTP 200                                               |
| `https://api.kaiplan.app/api/health` | HTTP 200 with JSON status                              |
| `pnpm run e2e:live`                  | Passes or reports product-flow issues beyond preflight |

If `my.kaiplan.app` resolves through `1.1.1.1` but not your router DNS, restart
the router or switch this machine to Cloudflare/Google DNS before rerunning the
live Playwright test.

## References

- Stripe API keys: https://docs.stripe.com/keys
- Stripe webhooks: https://docs.stripe.com/webhooks
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare API tokens: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Cloudflare Images delivery URLs: https://developers.cloudflare.com/images/optimization/hosted-images/serve-uploaded-images/
- Better Auth secret option: https://better-auth.com/docs/reference/options#secret
- Resend API keys: https://resend.com/docs/dashboard/api-keys/introduction
- Sentry DSN location: https://docs.sentry.dev/product/sentry-basics/integrate-backend/getting-started/
