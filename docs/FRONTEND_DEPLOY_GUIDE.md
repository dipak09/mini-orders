# Mini Orders Frontend — Step-by-step Deploy Guide

Takes the code built from [FRONTEND_PLAN.md](FRONTEND_PLAN.md) live at:

| Stage | Frontend | API it calls |
|---|---|---|
| dev | https://dev-front.hanuda.in | https://aws-dev.hanuda.in |
| prod | https://front.hanuda.in | https://aws.hanuda.in |

Do the steps in order. Each one ends with a **Check**. All commands run from the project root, `/var/www/claude/mini-orders`, with Node 22 (`nvm use 22`).

**Time:** about 1.5 hours, most of it waiting for the certificate and CloudFront.

---

## Step 1 — Ship the backend changes to dev (10 min)

The API now has `GET /orders`, `DELETE /orders/{id}` and CORS. Deploy them from your laptop first, so the frontend has something to talk to.

```bash
npm test                     # expect: Tests: 29 passed
sam validate --lint
sam build && sam deploy      # samconfig.toml already sets AllowedOrigins for dev
```

Then run the smoke test, which now also checks list, delete and the CORS preflight:

```bash
API_URL=https://aws-dev.hanuda.in FRONTEND_ORIGIN=https://dev-front.hanuda.in npm run smoke
```

**Check:** every line says `PASS`, including `delete order returns 204` and `CORS allows https://dev-front.hanuda.in`.

---

## Step 2 — Run the app locally (10 min)

```bash
cd frontend
npm ci
npm test                     # expect: Tests: 24 passed
npm run dev
```

Open http://localhost:5173. It talks to the **real dev API** (set in `frontend/.env.development`), and the badge in the top bar says `LOCAL`.

Try the whole flow:
1. **New order** → **Add a product to the catalog** → `Mechanical Keyboard`, `49.99` → **Add product**. It is selected automatically.
2. Enter an email, set quantity 2 → **Place order**. You land on the list with the new row highlighted and **Pending** pulsing.
3. Within 1–2 seconds it turns **Confirmed** by itself. That is the event flow: EventBridge → SQS → Notifications → EventBridge → Orders.
4. **Delete** → the dialog opens with **Cancel** focused → **Delete**. The row disappears.
5. Create one more with **Simulate notification failure** ticked. It stays **Pending** forever (it went to the DLQ).

**Check:** there are no red errors in the browser console (F12 → Console). Stop the server with Ctrl+C, then `cd ..`.

| Symptom | Cause | Fix |
|---|---|---|
| "Cannot reach the API" | CORS is not deployed yet, or the port isn't 5173 | Redo Step 1. Vite is pinned to port 5173 (`strictPort`), so close whatever else is using it |
| Console: `blocked by CORS policy` | The origin in `samconfig.toml` doesn't match exactly | It must be `http://localhost:5173`, with no trailing slash |

---

## Step 3 — Certificate for CloudFront, in us-east-1 (20 min)

CloudFront only accepts certificates from **us-east-1**, even though everything else is in Sydney. One certificate covers both names.

```bash
aws acm request-certificate --region us-east-1 \
  --domain-name front.hanuda.in --subject-alternative-names dev-front.hanuda.in \
  --validation-method DNS
```

> **If this fails with `explicit deny in a service control policy`, stop here.** Your account's region lock blocks it. Tell me, and we switch to the Amplify Hosting fallback (FRONTEND_PLAN.md, section 9).

Copy the `CertificateArn`. That is **`<FRONT_CERT_ARN>`** from now on. Then get the validation records:

```bash
aws acm describe-certificate --region us-east-1 --certificate-arn <FRONT_CERT_ARN> \
  --query "Certificate.DomainValidationOptions[].ResourceRecord" --output table
```

In Cloudflare → `hanuda.in` → **DNS** → **Add record**, do this for **each** of the 2 rows:
- Type `CNAME`
- Name: the `_xxxx.front` / `_xxxx.dev-front` value
- Target: the `_xxxx.acm-validations.aws` value
- **Grey cloud (DNS only)** → Save

```bash
aws acm wait certificate-validated --region us-east-1 --certificate-arn <FRONT_CERT_ARN>
aws acm describe-certificate --region us-east-1 --certificate-arn <FRONT_CERT_ARN> --query Certificate.Status --output text
```

**Check:** it prints `ISSUED`.

---

## Step 4 — Host the dev site (20 min)

### 4.1 Create the hosting stack

```bash
aws cloudformation deploy --template-file frontend/infra/hosting.yaml \
  --stack-name mini-orders-frontend-dev --region ap-southeast-2 \
  --parameter-overrides Stage=dev DomainName=dev-front.hanuda.in \
    CertificateArn=<FRONT_CERT_ARN> ApiOrigin=https://aws-dev.hanuda.in
```

This takes **5–10 minutes**, because CloudFront has to deploy worldwide. It creates a private S3 bucket, a CloudFront distribution that alone can read it (Origin Access Control), and the security headers (HSTS and a CSP that only allows calls to `aws-dev.hanuda.in`).

### 4.2 Point DNS at CloudFront

```bash
aws cloudformation describe-stacks --stack-name mini-orders-frontend-dev --region ap-southeast-2 \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text
```

That prints something like `d1abcd2efgh3.cloudfront.net`. In Cloudflare → **Add record**: Type `CNAME`, Name `dev-front`, Target = that value, **grey cloud** → Save.

### 4.3 Build and upload

```bash
frontend/scripts/deploy.sh dev
```

The script builds with `VITE_API_URL=https://aws-dev.hanuda.in` and `VITE_STAGE=dev`. It uploads hashed assets with a 1-year cache and `index.html` with `no-cache`, then invalidates `/` and `/index.html` in CloudFront.

**Check:**
```bash
curl -sI https://dev-front.hanuda.in | grep -iE "^HTTP|content-security|strict-transport"
#   HTTP/2 200, plus the CSP and HSTS headers
curl -s -o /dev/null -w "%{http_code}\n" https://dev-front.hanuda.in/new        # 200 (SPA fallback)
```

Then open https://dev-front.hanuda.in and repeat the Step 2 flow. The badge now says `DEV`.

| Symptom | Cause | Fix |
|---|---|---|
| `Could not resolve host` | DNS not propagated yet | Wait 1–2 minutes |
| Certificate error in the browser | The Cloudflare record is orange (proxied) | Switch it to grey |
| `403` / `AccessDenied` XML | Nothing uploaded yet, or the bucket policy is wrong | Run 4.3 again. Check that the bucket policy names this distribution |
| Old version still shows | Browser cache | Hard reload (Ctrl+Shift+R). `index.html` is `no-cache`, so a plain reload usually works |
| Console: `Refused to connect ... Content Security Policy` | `ApiOrigin` is wrong in 4.1 | Redeploy 4.1 with `ApiOrigin=https://aws-dev.hanuda.in` |

---

## Step 5 — Teach the pipeline about the frontend (5 min)

The pipeline now also builds, tests and deploys the frontend. It reads 3 new GitHub environment variables, and the setup script is safe to re-run (it leaves the existing access key alone):

```bash
REPO=dipak09/mini-orders \
CERT_ARN=arn:aws:acm:ap-southeast-2:764988200316:certificate/dca36602-d0c7-42a5-ad8c-38e4f48a0160 \
FRONTEND_CERT_ARN=<FRONT_CERT_ARN> \
bash scripts/setup-github.sh
```

| Variable | dev | production |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://dev-front.hanuda.in,http://localhost:5173` | `https://front.hanuda.in` |
| `FRONTEND_DOMAIN` | `dev-front.hanuda.in` | `front.hanuda.in` |
| `FRONTEND_CERT_ARN` | `<FRONT_CERT_ARN>` | `<FRONT_CERT_ARN>` |

Without `FRONTEND_CERT_ARN`, the pipeline skips the frontend steps instead of failing.

**Check:** repo → **Settings → Environments → dev** lists 5 variables.

---

## Step 6 — Commit and run the pipeline (15 min + approval)

```bash
git add -A
git status          # must NOT list frontend/node_modules, frontend/dist, .jetro/
git commit -m "feat: orders list/delete API, CORS, React frontend with CloudFront hosting"
git push origin dev
git push origin dev:main
gh run watch
```

What the pipeline does now:

| Job | Steps |
|---|---|
| `test` | Backend tests + SAM validate. Frontend lint, typecheck, 24 tests, build |
| `deploy-dev` | Backend deploy → smoke test (now with list/delete/CORS) → hosting stack (no change, you made it in Step 4) → build and publish to `dev-front` |
| `deploy-prod` | Waits for your approval → the same for prod. **It creates `mini-orders-frontend-prod` itself on the first run** (5–10 minutes) |

Approve prod: GitHub → **Actions** → the run → **Review deployments** → `production` → **Approve and deploy**.

**Check:** all three jobs are green.

---

## Step 7 — Prod DNS (10 min)

Two records, because the prod frontend calls `aws.hanuda.in`, which doesn't resolve yet (backend DEPLOY_GUIDE Phase 5.3 is still open).

```bash
# API
aws cloudformation describe-stacks --stack-name mini-orders-prod --region ap-southeast-2 \
  --query "Stacks[0].Outputs[?OutputKey=='CustomDomainTarget'].OutputValue" --output text
# Frontend
aws cloudformation describe-stacks --stack-name mini-orders-frontend-prod --region ap-southeast-2 \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text
```

In Cloudflare, both **grey cloud**:

| Name | Target |
|---|---|
| `aws` | the `d-xxxx.execute-api.ap-southeast-2.amazonaws.com` value |
| `front` | the `dxxxx.cloudfront.net` value |

**Check:**
```bash
curl -s https://aws.hanuda.in/products | head -c 80; echo
curl -sI https://front.hanuda.in | head -1
```

Then open https://front.hanuda.in. There is **no** stage badge on prod.

---

## Step 8 — Verify everything (10 min)

Tick the Definition of Done in [FRONTEND_PLAN.md](FRONTEND_PLAN.md), section 10:

```bash
# Prod CORS refuses localhost (expect no access-control-allow-origin line)
curl -si -X OPTIONS https://aws.hanuda.in/orders \
  -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: DELETE' | grep -i access-control-allow-origin

# The bucket can't be read directly (expect 403)
B=$(aws cloudformation describe-stacks --stack-name mini-orders-frontend-prod --region ap-southeast-2 \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
curl -s -o /dev/null -w "%{http_code}\n" https://$B.s3.ap-southeast-2.amazonaws.com/index.html
```

In the browser on https://front.hanuda.in: create → watch it confirm → delete → reload on `/new`. There must be no CORS or CSP errors in the console.

---

## Demo script additions

Open https://front.hanuda.in on screen and keep the backend guide's `curl` commands as a backup.

1. Create an order in the UI. **Pending** pulses, then flips to **Confirmed** by itself. Say: "the UI only polls while something is pending; the confirmation comes from the event chain, not from this request."
2. Tick **Simulate notification failure** → it stays Pending → show the DLQ alarm (backend guide, Phase 7).
3. Delete an order, then run `curl https://aws.hanuda.in/orders/<id>` → 404.
4. Talking point: "CORS stops other *websites* from calling my API, not `curl`. So delete is still public; the fix is a JWT authorizer (plan F7)."

---

## Teardown additions

Do these before the backend teardown (DEPLOY_GUIDE Phase 8). A bucket must be empty before its stack can be deleted.

```bash
for st in prod dev; do
  B=$(aws cloudformation describe-stacks --stack-name mini-orders-frontend-$st --region ap-southeast-2 \
    --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
  aws s3 rm s3://$B --recursive
  aws cloudformation delete-stack --stack-name mini-orders-frontend-$st --region ap-southeast-2
done
aws acm delete-certificate --region us-east-1 --certificate-arn <FRONT_CERT_ARN>   # after both stacks are gone
```

In Cloudflare, delete `front`, `dev-front` and the two `_xxxx` validation records.
