#!/bin/sh
# Run the telescope preview fix from the VPS host.
# Reads Telescope AWS credentials from the telescope project's .env
# and marketplace S3/MongoDB credentials from this project's .env.
#
# Usage (from /home/deploy/projects/telegram-marketplace-checkout):
#   bash scripts/run-telescope-fix.sh

set -e

TELESCOPE_ENV="/home/deploy/projects/telescope/.env"
MARKETPLACE_ENV="/home/deploy/projects/telegram-marketplace-checkout/.env"

if [ ! -f "$TELESCOPE_ENV" ]; then
  echo "Telescope .env not found at $TELESCOPE_ENV"
  exit 1
fi
if [ ! -f "$MARKETPLACE_ENV" ]; then
  echo "Marketplace .env not found at $MARKETPLACE_ENV"
  exit 1
fi

# Extract Telescope S3 values.
TELESCOPE_S3_BUCKET=$(grep '^S3_BUCKET_NAME=' "$TELESCOPE_ENV" | cut -d= -f2-)
TELESCOPE_S3_REGION=$(grep '^AWS_REGION=' "$TELESCOPE_ENV" | cut -d= -f2-)
TELESCOPE_S3_ACCESS_KEY=$(grep '^AWS_ACCESS_KEY_ID=' "$TELESCOPE_ENV" | cut -d= -f2-)
TELESCOPE_S3_SECRET_KEY=$(grep '^AWS_SECRET_ACCESS_KEY=' "$TELESCOPE_ENV" | cut -d= -f2-)
TELESCOPE_MONGODB_URI=$(grep '^MONGODB_URI=' "$TELESCOPE_ENV" | cut -d= -f2-)

# The marketplace API container has the MinIO credentials via its .env,
# but we also need the Telescope credentials. Run inside the container
# by passing extra env vars.

echo "Copying fix script into api container..."
docker cp apps/api/src/fix-telescope-previews.ts telegram-marketplace-checkout-api-1:/app/fix-telescope-previews.ts

echo "Installing tsx in the container..."
docker exec telegram-marketplace-checkout-api-1 sh -c "npm install -g tsx 2>/dev/null || true"

echo "Running fix script..."
docker exec \
  -e "TELESCOPE_MONGODB_URI=$TELESCOPE_MONGODB_URI" \
  -e "TELESCOPE_S3_BUCKET=$TELESCOPE_S3_BUCKET" \
  -e "TELESCOPE_S3_REGION=$TELESCOPE_S3_REGION" \
  -e "TELESCOPE_S3_ACCESS_KEY=$TELESCOPE_S3_ACCESS_KEY" \
  -e "TELESCOPE_S3_SECRET_KEY=$TELESCOPE_S3_SECRET_KEY" \
  telegram-marketplace-checkout-api-1 \
  npx tsx /app/fix-telescope-previews.ts

echo "Done."
