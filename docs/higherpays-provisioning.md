# HigherPays marketplace provisioning

The Mini App never creates HigherPays people or workspaces. The official
marketplace checkout endpoint only accepts a pre-provisioned workspace, account,
and agent through HigherPays server configuration.

The HigherPays operator must run this once, through HigherPays' authenticated
platform/service layer, before enabling production checkout:

1. Reuse the active `OnlyElite` EUR workspace if it exists. Otherwise create
   exactly one workspace named `OnlyElite`.
2. Create exactly one active synthetic account named `OnlyElite Marketplace
   Creator` and one active synthetic agent named `OnlyElite Marketplace
   Chatter`. These must be dedicated integration records, not a catalog creator
   or a Telegram buyer.
3. Assign the synthetic agent to the synthetic account.
4. Configure the HigherPays marketplace integration with the workspace,
   account, and agent IDs. Set its callback to
   `https://<mini-app-host>/api/integrations/higherpays/events`.
5. Generate a dedicated integration API key and HMAC callback secret. Put the
   raw values only in the Mini App environment as
   `HIGHERPAYS_MARKETPLACE_API_KEY` and
   `HIGHERPAYS_EVENT_SIGNING_SECRET`; put only the API-key hash in HigherPays.
6. Set `HIGHERPAYS_API_BASE` to the HigherPays API base URL. Do not set
   MantaPay credentials in the Mini App.

The operator must verify that a repeated `POST /integrations/marketplace/orders`
with the same `marketplaceOrderId`, EUR minor total, and return URL returns the
same payment link. The Mini App derives that ID from its immutable cart ID, so
one cart creates one HigherPays link.
