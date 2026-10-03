#!/usr/bin/env bash
# Move the iphotos-fotos S3 bucket from eu-north-1 (Stockholm) to sa-east-1 (Sao Paulo).
#
# S3 buckets cannot change region in place and bucket names are global: the source
# bucket must be deleted before the same name can be recreated in sa-east-1. The IAM
# user `iphotos` (backend/.env credentials) has data-plane access only — run this with
# credentials allowed to create/delete buckets, e.g.:
#
#   AWS_PROFILE=<admin-profile> bash scripts/move-s3-bucket-to-sa-east-1.sh
#
# Steps: verify the source bucket is empty -> delete it -> recreate it in sa-east-1
# (public access blocked) -> flip IPHOTOS_S3_REGION in backend/.env -> recreate the
# storage container -> verify the service answers with s3 as default provider.

set -euo pipefail

BUCKET=iphotos-fotos
FROM=eu-north-1
TO=sa-east-1
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

command -v aws >/dev/null || { echo "aws CLI not found"; exit 1; }
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found"; exit 1; }

echo "== checking bucket region"
current="$(aws s3api get-bucket-location --bucket "$BUCKET" --query LocationConstraint --output text 2>/dev/null || echo missing)"
if [ "$current" = "$TO" ]; then
  echo "Bucket already in $TO — skipping the move."
elif [ "$current" != "$FROM" ] && [ "$current" != "missing" ]; then
  echo "Bucket is in '$current', expected '$FROM' or '$TO' — aborting."
  exit 1
fi

if [ "$current" = "$FROM" ]; then
  echo "== verifying $BUCKET is empty"
  count="$(aws s3api list-objects-v2 --bucket "$BUCKET" --query KeyCount --output text)"
  if [ "$count" != "0" ]; then
    echo "Bucket holds $count object(s). Copy them out first, e.g.:"
    echo "  aws s3 sync s3://$BUCKET s3://$BUCKET-mig --source-region $FROM --region $TO"
    echo "then move them back once this script has recreated the bucket (or point"
    echo "IPHOTOS_S3_BUCKET at the temporary bucket and rename it in the console)."
    exit 1
  fi

  echo "== deleting empty bucket in $FROM"
  aws s3api delete-bucket --bucket "$BUCKET"
fi

echo "== creating bucket in $TO"
aws s3api create-bucket --bucket "$BUCKET" --region "$TO" \
  --create-bucket-configuration "LocationConstraint=$TO"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  || echo "warning: could not set the public access block (set it in the console)"

echo "== updating $ENV_FILE region -> $TO"
sed -i "s/^IPHOTOS_S3_REGION=.*/IPHOTOS_S3_REGION=$TO/" "$ENV_FILE"

echo "== recreating the storage container"
docker compose --project-directory "$BACKEND_DIR" up -d --build storage

echo "== verifying"
sleep 5
curl -fsS http://127.0.0.1:5206/health
echo
curl -fsS -H "X-Api-Key: ${IPHOTOS_STORAGE_API_KEY:-change-me-storage-api-key}" \
  http://127.0.0.1:5206/api/providers
echo
echo "Done: $BUCKET now lives in $TO and the storage container uses it."
