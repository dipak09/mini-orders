#!/usr/bin/env bash
# One-time GitHub setup for the CI/CD pipeline.
#  - creates the `dev` and `production` environments, both limited to the `main` branch
#  - `production` requires your approval
#  - sets DOMAIN_NAME / CERTIFICATE_ARN environment variables
#  - creates an access key for the deploy user and stores it ONLY as environment secrets
#    (the secret is never printed or written to disk)
#
# Usage: REPO=dipak09/mini-orders CERT_ARN=arn:aws:acm:... bash scripts/setup-github.sh
set -euo pipefail

REPO="${REPO:?set REPO=owner/name}"
CERT_ARN="${CERT_ARN:?set CERT_ARN to the ACM certificate ARN}"
DEPLOY_USER=mini-orders-github-deploy
REVIEWER_ID=$(gh api user -q .id)

echo "== Environments"
for env in dev production; do
  if [ "$env" = production ]; then
    reviewers="[{\"type\":\"User\",\"id\":$REVIEWER_ID}]"
  else
    reviewers="[]"
  fi
  gh api -X PUT "repos/$REPO/environments/$env" --input - >/dev/null <<EOF
{"reviewers": $reviewers,
 "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
EOF
  gh api -X POST "repos/$REPO/environments/$env/deployment-branch-policies" -f name=main >/dev/null 2>&1 || true
  echo "   $env: main only$( [ "$env" = production ] && echo ', approval required')"
done

echo "== Environment variables"
set_var() {  # env name value
  gh api -X POST "repos/$REPO/environments/$1/variables" -f name="$2" -f value="$3" >/dev/null 2>&1 \
    || gh api -X PATCH "repos/$REPO/environments/$1/variables/$2" -f name="$2" -f value="$3" >/dev/null
}
set_var dev        DOMAIN_NAME     aws-dev.hanuda.in
set_var dev        CERTIFICATE_ARN "$CERT_ARN"
set_var production DOMAIN_NAME     aws.hanuda.in
set_var production CERTIFICATE_ARN "$CERT_ARN"
echo "   done"

echo "== Access key for $DEPLOY_USER"
existing=$(aws iam list-access-keys --user-name "$DEPLOY_USER" --query 'length(AccessKeyMetadata)' --output text)
if [ "$existing" != "0" ]; then
  echo "   $DEPLOY_USER already has $existing key(s). Delete them first (rotation):"
  echo "   aws iam list-access-keys --user-name $DEPLOY_USER"
  echo "   aws iam delete-access-key --user-name $DEPLOY_USER --access-key-id <id>"
  exit 1
fi
KEY_JSON=$(aws iam create-access-key --user-name "$DEPLOY_USER" --output json)
AKID=$(printf '%s' "$KEY_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["AccessKey"]["AccessKeyId"], end="")')
SECRET=$(printf '%s' "$KEY_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["AccessKey"]["SecretAccessKey"], end="")')
unset KEY_JSON
for env in dev production; do
  printf '%s' "$AKID"   | gh secret set AWS_ACCESS_KEY_ID     --env "$env" -R "$REPO" >/dev/null
  printf '%s' "$SECRET" | gh secret set AWS_SECRET_ACCESS_KEY --env "$env" -R "$REPO" >/dev/null
done
unset SECRET
echo "   key $AKID stored as environment secrets in dev and production"
echo
echo "All set. Next: push to main."
