#!/bin/sh
set -e
TELESCOPE_ENV="/home/deploy/projects/telescope/.env"
if [ ! -f "$TELESCOPE_ENV" ]; then echo "Telescope .env not found"; exit 1; fi
TELESCOPE_S3_BUCKET=$(grep '^S3_BUCKET_NAME=' "$TELESCOPE_ENV" | cut -d= -f2-)
TELESCOPE_S3_REGION=$(grep '^AWS_REGION=' "$TELESCOPE_ENV" | cut -d= -f2-)
TELESCOPE_S3_ACCESS_KEY=$(grep '^AWS_ACCESS_KEY_ID=' "$TELESCOPE_ENV" | cut -d= -f2-)
TELESCOPE_S3_SECRET_KEY=$(grep '^AWS_SECRET_ACCESS_KEY=' "$TELESCOPE_ENV" | cut -d= -f2-)
NETWORK="telegram-marketplace-checkout_default"
echo "Running fix script..."
docker run --rm \
  --network "$NETWORK" \
  --env-file .env \
  -e "TELESCOPE_S3_BUCKET=$TELESCOPE_S3_BUCKET" \
  -e "TELESCOPE_S3_REGION=$TELESCOPE_S3_REGION" \
  -e "TELESCOPE_S3_ACCESS_KEY=$TELESCOPE_S3_ACCESS_KEY" \
  -e "TELESCOPE_S3_SECRET_KEY=$TELESCOPE_S3_SECRET_KEY" \
  -v "$PWD:/src:ro" \
  -w /work \
  node:22-alpine \
  sh -c "cp /src/package.json /src/package-lock.json . && mkdir -p apps/api && cp /src/apps/api/package.json apps/api/ && mkdir -p apps/web && cp /src/apps/web/package.json apps/web/ && npm ci --ignore-scripts 2>&1 | tail -1 && cp -r /src/apps/api/src apps/api/src && npx tsx apps/api/src/fix-telescope-previews.ts"
echo "Done."
