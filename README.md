# Telegram Marketplace Checkout

HigherPays-hosted checkout for a Telegram-launched catalog, with MongoDB order/entitlement records, private S3-compatible media storage, and post-payment Bot API delivery.

## Run locally

1. Copy `.env.example` to `.env` and replace every production secret.
2. Start MongoDB and MinIO with `docker compose up -d`.
3. Run `npm install`, then `npm run dev` and `npm run dev:web` in another terminal.
4. Configure the Telegram Mini App URL to your HTTPS web deployment. HigherPays owns the provider callback and posts signed lifecycle events to `https://your-host/api/integrations/higherpays/events`.

The browser UI needs to be launched from Telegram because the API verifies `WebApp.initData`. Use the admin API/UI to create an agency, agent, set the agency's `defaultAgentId`, attest and publish a creator, upload/complete media, then create and publish a product.

## Important production requirements

- HigherPays owns the MantaPay merchant configuration, hosted checkout, confirmation, reconciliation, and ledger. This service must never be given MantaPay credentials.
- Configure TLS, persistent MongoDB backups, malware scanning for uploaded objects, and a dedicated MantaPay test merchant before launch.
- Set `HIGHERPAYS_API_BASE`, `HIGHERPAYS_MARKETPLACE_API_KEY`, and `HIGHERPAYS_EVENT_SIGNING_SECRET` only after HigherPays is deployed and its synthetic Marketplace creator/chatter is configured.

## Payment and delivery readiness

Checkout is enabled only when the HigherPays integration values are present.
The checkout endpoint redirects the customer to a HigherPays payment link and
accepts a signed HigherPays event at `/api/integrations/higherpays/events`. An approved payment creates
entitlements and sends the private media as protected documents to the
customer's Telegram chat. The Mini App never exposes purchase download URLs.

The bot must be configured with `TELEGRAM_BOT_TOKEN`, and customers must have
started the bot so that it has a chat ID for delivery. Object storage must be
configured through the `S3_*` values. For browser uploads, `S3_PUBLIC_ENDPOINT`
must be reachable by the administrator's browser.
