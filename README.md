# Telegram Marketplace Checkout

External MantaPay checkout for a Telegram-launched catalog, with MongoDB order/entitlement records, private S3-compatible media storage, and post-payment Bot API delivery.

## Run locally

1. Copy `.env.example` to `.env` and replace every production secret.
2. Start MongoDB and MinIO with `docker compose up -d`.
3. Run `npm install`, then `npm run dev` and `npm run dev:web` in another terminal.
4. Configure the Telegram Mini App URL to your HTTPS web deployment and MantaPay's callback URL to `https://your-host/api/webhooks/mantapay`.

The browser UI needs to be launched from Telegram because the API verifies `WebApp.initData`. Use the admin API/UI to create an agency, agent, set the agency's `defaultAgentId`, attest and publish a creator, upload/complete media, then create and publish a product.

## Important production requirements

- Use external MantaPay checkout. Digital goods cannot use a non-Stars checkout inside a Telegram Mini App.
- Obtain MantaPay's written approval for the intended content category before accepting live payments.
- Configure TLS, persistent MongoDB backups, malware scanning for uploaded objects, and a dedicated MantaPay test merchant before launch.
- A dedicated HigherPays marketplace ingestion endpoint is implemented separately in the HigherPays repository; set `HIGHERPAYS_API_BASE` and `HIGHERPAYS_MARKETPLACE_API_KEY` only after it is deployed.
