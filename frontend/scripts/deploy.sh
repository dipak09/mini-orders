#!/usr/bin/env bash
# Build the frontend for a stage and publish it to that stage's S3 bucket + CloudFront.
# Same script on the laptop and in CI.
#
# Usage: frontend/scripts/deploy.sh dev|prod
# Env:   API_URL     (default: https://aws-dev.hanuda.in for dev, https://aws.hanuda.in for prod)
#        AWS_REGION  (default: ap-southeast-2)
set -euo pipefail

STAGE="${1:?usage: deploy.sh dev|prod}"
case "$STAGE" in
  dev)  DEFAULT_API=https://aws-dev.hanuda.in ;;
  prod) DEFAULT_API=https://aws.hanuda.in ;;
  *) echo "stage must be dev or prod" >&2; exit 2 ;;
esac
API_URL="${API_URL:-$DEFAULT_API}"
REGION="${AWS_REGION:-ap-southeast-2}"
STACK="mini-orders-frontend-$STAGE"
cd "$(dirname "$0")/.."

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(output BucketName)
DIST_ID=$(output DistributionId)

echo "== Build ($STAGE, API $API_URL)"
VITE_API_URL="$API_URL" VITE_STAGE="$STAGE" npm run build

echo "== Upload to s3://$BUCKET"
# Hashed assets never change: cache for a year.
aws s3 sync dist/assets "s3://$BUCKET/assets" --region "$REGION" \
  --cache-control "public,max-age=31536000,immutable"
# Other static files (favicon...): short cache.
aws s3 sync dist "s3://$BUCKET" --region "$REGION" \
  --exclude "assets/*" --exclude "index.html" --cache-control "public,max-age=3600"
# index.html last, so it never points at assets that are not uploaded yet.
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --region "$REGION" \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"

echo "== Invalidate CloudFront $DIST_ID"
# "/" is cached separately from "/index.html" (DefaultRootObject), so invalidate both.
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/" "/index.html" \
  --query "Invalidation.Id" --output text

echo "Deployed: https://$(output DistributionDomain)  (served at your custom domain once DNS points there)"
