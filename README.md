# Vesper

OnlyElite's Telegram-launched content catalogue, with direct MantaPay checkout,
MongoDB order records, private S3-compatible media storage, and protected Bot API delivery.

## Run locally

1. Copy `.env.example` to `.env` and replace every production secret.
2. Start MongoDB and MinIO with `docker compose up -d`.
3. Run `npm install`, then `npm run dev` and `npm run dev:web` in another terminal.
4. Configure the Telegram Mini App URL to your HTTPS web deployment and set the MantaPay callback to `https://your-host/api/webhooks/mantapay`.

The browser UI needs to be launched from Telegram because the API verifies `WebApp.initData`. The catalogue is single-operator: add and publish creators, create categories, upload/complete media, then create and publish products.

## Important production requirements

- Configure TLS, persistent MongoDB backups, malware scanning for uploaded objects, and a dedicated MantaPay test merchant before launch.
- Configure `MANTAPAY_MERCHANT_ID` and `MANTAPAY_HASH_KEY` only in the server environment.

## Payment and delivery readiness

Checkout is enabled only when the MantaPay integration values are present.
The checkout endpoint redirects the customer to a MantaPay payment link and
accepts a signed MantaPay event at `/api/webhooks/mantapay`. Approved callbacks are checked against MantaPay's status API and the order amount and currency before delivery. An approved payment creates
entitlements and sends the private media as protected documents to the
customer's Telegram chat. The Mini App never exposes purchase download URLs.

The bot must be configured with `TELEGRAM_BOT_TOKEN`, and customers must have
started the bot so that it has a chat ID for delivery. Object storage must be
configured through the `S3_*` values. For browser uploads, `S3_PUBLIC_ENDPOINT`
must be reachable by the administrator's browser.
