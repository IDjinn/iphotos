#!/usr/bin/env bash
# (Re)create the `iphotos` IAM user, its bucket-scoped policy and a fresh access key.
#
# backend/.env authenticates to S3 as this user; it needs no console access. IAM
# management requires admin credentials, so run this from an admin shell (root
# account, an admin profile or CloudShell):
#
#   AWS_PROFILE=<admin> bash scripts/create-iphotos-iam-user.sh
#
# Env overrides:
#   USER_NAME  IAM user name            (default: iphotos)
#   BUCKET     bucket the policy scopes (default: iphotos-fotos)
#   MGMT=1     also grant s3:CreateBucket/DeleteBucket/etc., so this user can run
#              scripts/move-s3-bucket-to-sa-east-1.sh itself (revoke afterwards)
#   UPDATE_CLI=1  also write the new key into ~/.aws/credentials [default]
#                 (use it when that profile held the old, now-deleted key)
#
# After running: check IPHOTOS_S3_REGION in backend/.env matches the bucket's
# region, then: docker compose up -d storage

set -euo pipefail

USER_NAME="${USER_NAME:-iphotos}"
BUCKET="${BUCKET:-iphotos-fotos}"
MGMT="${MGMT:-0}"
UPDATE_CLI="${UPDATE_CLI:-0}"
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

command -v aws >/dev/null || { echo "aws CLI not found"; exit 1; }

MGMT_STATEMENT=""
if [ "$MGMT" = "1" ]; then
  MGMT_STATEMENT=',
    {
      "Sid": "BucketManagement",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:PutBucketPublicAccessBlock",
        "s3:ListAllMyBuckets"
      ],
      "Resource": "*"
    }'
fi

POLICY="{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"BucketList\",
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:ListBucket\", \"s3:GetBucketLocation\"],
      \"Resource\": \"arn:aws:s3:::$BUCKET\"
    },
    {
      \"Sid\": \"ObjectReadWrite\",
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:DeleteObject\"],
      \"Resource\": \"arn:aws:s3:::$BUCKET/*\"
    }$MGMT_STATEMENT,
    {
      \"Sid\": \"DenyInsecureTransport\",
      \"Effect\": \"Deny\",
      \"Action\": \"s3:*\",
      \"Resource\": [\"arn:aws:s3:::$BUCKET\", \"arn:aws:s3:::$BUCKET/*\"],
      \"Condition\": { \"Bool\": { \"aws:SecureTransport\": \"false\" } }
    }
  ]
}"

echo "== creating user '$USER_NAME' (ignored if it already exists)"
aws iam create-user --user-name "$USER_NAME" 2>/dev/null || echo "   user already exists — keeping it"

echo "== putting inline policy 'iphotos-s3' (bucket: $BUCKET, mgmt: $MGMT)"
aws iam put-user-policy --user-name "$USER_NAME" --policy-name iphotos-s3 \
  --policy-document "$POLICY"

echo "== creating a new access key"
read -r ACCESS_KEY SECRET_KEY < <(
  aws iam create-access-key --user-name "$USER_NAME" \
    --query '[AccessKey.AccessKeyId, AccessKey.SecretAccessKey]' --output text
)

if [ -f "$ENV_FILE" ]; then
  sed -i "s|^IPHOTOS_S3_ACCESS_KEY=.*|IPHOTOS_S3_ACCESS_KEY=$ACCESS_KEY|" "$ENV_FILE"
  sed -i "s|^IPHOTOS_S3_SECRET_KEY=.*|IPHOTOS_S3_SECRET_KEY=$SECRET_KEY|" "$ENV_FILE"
  echo "== $ENV_FILE updated with the new key"
else
  echo "== $ENV_FILE not found — key NOT written anywhere persistent:"
fi
echo "   ACCESS_KEY_ID:     $ACCESS_KEY"
echo "   SECRET_ACCESS_KEY: $SECRET_KEY   (shown once — store it safely)"

echo "== deleting older access keys"
for old in $(aws iam list-access-keys --user-name "$USER_NAME" \
    --query "AccessKeyMetadata[].AccessKeyId" --output text | tr '\t' '\n'); do
  if [ "$old" != "$ACCESS_KEY" ]; then
    echo "   deleting $old"
    aws iam delete-access-key --user-name "$USER_NAME" --access-key-id "$old"
  fi
done

if [ "$UPDATE_CLI" = "1" ]; then
  aws configure set aws_access_key_id "$ACCESS_KEY" --profile default
  aws configure set aws_secret_access_key "$SECRET_KEY" --profile default
  echo "== ~/.aws/credentials [default] updated with the new key"
fi

echo
echo "Done. Next steps:"
echo "  1. Confirm the bucket region:  aws s3api get-bucket-location --bucket $BUCKET"
echo "  2. Set IPHOTOS_S3_REGION in backend/.env to that region"
echo "  3. docker compose up -d storage"
