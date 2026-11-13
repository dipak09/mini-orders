# Mini Orders — Project Plan

Goal: get this project live on AWS (paid for by free credit), reachable at **https://aws.hanuda.in**, deployed by the GitHub Actions pipeline, and rehearsed as a demo.

The step-by-step commands are in [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md). This file is the map: what exists, what is missing, and in what order to do the work.

---

## 1. Where the project stands today

| Area | State |
|---|---|
| Code | Complete. 3 services, 4 Lambda functions. |
| Unit tests | 17 of 17 pass, 94.7% line coverage (gate is 80%). Run on 2026-11-13 with Node 20. |
| Infrastructure template | `template.yaml` passes cfn-lint with no findings. |
| Deployed to AWS | No. Nothing is deployed yet. |
| Git / GitHub | Not a git repository yet. No remote. |
| Custom domain | Not in the template. Must be added (section 4, gap G1). |
| Local tools | AWS CLI 2.17 installed. **SAM CLI is not installed.** Node 22 is installed in nvm but Node 20 is the active version. |

## 2. Project index

### Files

| Path | What it is |
|---|---|
| [README.md](../README.md) | Architecture, design decisions, run steps, demo script |
| [template.yaml](../template.yaml) | All AWS resources (SAM / CloudFormation). One `Stage` parameter: `dev` or `prod` |
| [samconfig.toml](../samconfig.toml) | Defaults for `sam deploy` from the laptop: stack `mini-orders-dev`, region `ap-south-1` |
| [services/catalog/index.js](../services/catalog/index.js) | Catalog service: `POST /products`, `GET /products`, `GET /products/{id}` |
| [services/orders/api.js](../services/orders/api.js) | Orders HTTP: `POST /orders`, `GET /orders/{id}`. Publishes `OrderCreated` |
| [services/orders/status.js](../services/orders/status.js) | Orders event consumer: on `NotificationSent`, sets the order to `CONFIRMED` |
| [services/notifications/index.js](../services/notifications/index.js) | SQS consumer: "sends" the email (a log line), publishes `NotificationSent` |
| [tests/](../tests/) | Jest unit tests with `aws-sdk-client-mock`, one file per service |
| [scripts/smoke-test.mjs](../scripts/smoke-test.mjs) | End-to-end test against a deployed API (`API_URL=... npm run smoke`) |
| [infra/github-oidc.yaml](../infra/github-oidc.yaml) | One-time stack: GitHub OIDC provider and the `mini-orders-github-deploy` role |
| [.github/workflows/ci-cd.yml](../.github/workflows/ci-cd.yml) | Pipeline: test → deploy dev + smoke → manual approval → deploy prod + smoke |

### AWS resources per stack (created by `template.yaml`)

| Resource | Count | Notes |
|---|---|---|
| API Gateway HTTP API | 1 | Throttle: 100 requests/second, burst 50 |
| Lambda functions | 4 | Node 22, arm64, 256 MB, 10 s timeout, X-Ray on |
| DynamoDB tables | 2 | Products, Orders. On-demand billing, point-in-time recovery on |
| EventBridge bus | 1 | `mini-orders-<stage>`, with 2 rules |
| SQS queues | 2 | Notifications queue and its dead-letter queue (3 attempts) |
| CloudWatch alarm | 1 | Fires when the dead-letter queue is not empty. Has no notification target |
| Log groups | 4 | 14-day retention |

### Request flow

1. `POST /orders` → Orders API saves the order as `PENDING`, publishes `OrderCreated`.
2. EventBridge rule → SQS queue → Notifications function logs the "email", publishes `NotificationSent`.
3. EventBridge rule → Orders Status function sets `CONFIRMED` (conditional write, so duplicates do nothing).
4. If the email address contains `fail`, the Notifications function throws. After 3 attempts the message goes to the dead-letter queue and the alarm fires.

## 3. Target setup

| Item | Value |
|---|---|
| AWS region | `ap-south-1` (Mumbai) |
| Prod URL | `https://aws.hanuda.in` → stack `mini-orders-prod` |
| Dev URL | `https://aws-dev.hanuda.in` → stack `mini-orders-dev` |
| DNS | Cloudflare, CNAME records, **DNS only** (grey cloud) |
| TLS certificate | AWS Certificate Manager, in `ap-south-1`, validated by a DNS record in Cloudflare. Free |
| Deploys | GitHub Actions with OIDC. No AWS keys stored in GitHub |

Why `aws-dev.hanuda.in` and not `dev.aws.hanuda.in`: Cloudflare's free certificate covers one level of subdomain only. A two-level name breaks if you ever turn the Cloudflare proxy on.

Why DNS only: API Gateway already serves the certificate for the custom domain. With the grey cloud, Cloudflare just answers the DNS lookup and there is nothing else to configure. If you later want the orange cloud, set Cloudflare SSL mode to **Full (strict)** first.

## 4. Gaps to close

### Must do before the URL goes live

| # | Gap | Fix | Guide step |
|---|---|---|---|
| G1 | No custom domain in `template.yaml` | Add `DomainName` and `CertificateArn` parameters, an API Gateway domain and an API mapping. The snippet is lint-clean | Phase 3 |
| G2 | SAM CLI not installed | Install it | Phase 0 |
| G3 | Active Node is 20; project and CI use 22. AWS SDK prints an end-of-support warning on 20 | `nvm use 22` | Phase 0 |
| G4 | Not a git repo | `git init`, push to GitHub | Phase 4 |
| G5 | `.jetro/` is not in `.gitignore`. It holds a `credentials.json` file that would be committed | Add `.jetro/` to `.gitignore` before the first commit | Phase 0 |
| G6 | Public, unauthenticated write API throttled at 100 requests/second. A script hammering the URL could spend real credit (roughly $10+ a day at the full rate) | Lower the throttle to 5/second, burst 10. Add a budget alert | Phases 1 and 3 |
| G7 | Pipeline does not pass the domain parameters, so a pipeline deploy would remove the custom domain that a laptop deploy added | Pass them from GitHub environment variables | Phase 4 |
| G8 | Deploy role trusts `environment:*` ([github-oidc.yaml:49](../infra/github-oidc.yaml#L49)). GitHub creates environments on demand, so anyone who can push any branch can get PowerUser credentials, skipping review and the prod approval | Exact `StringEquals` on the `dev` and `production` subjects, plus `main`-only deployment branches on both environments. Written up in [INTERVIEW_SECURITY_ANSWER.md](INTERVIEW_SECURITY_ANSWER.md) | Phase 4 |

### Should do (small, and each one is a good talking point)

| # | Finding | Where | Fix |
|---|---|---|---|
| S1 | `PutEvents` can return HTTP 200 with `FailedEntryCount > 0`. Neither publisher checks it, so an event can be lost silently | [api.js:62](../services/orders/api.js#L62), [notifications/index.js:21](../services/notifications/index.js#L21) | Throw when `FailedEntryCount > 0` |
| S2 | The dead-letter alarm notifies nobody | [template.yaml:159](../template.yaml#L159) | Add an SNS topic with your email as `AlarmActions` |
| S3 | An order whose notification fails stays `PENDING` forever | [status.js](../services/orders/status.js) | Add a `FAILED` state driven from the dead-letter queue, or say so in the demo |
| S4 | Every pipeline run leaves a "Smoke Test Keyboard" product and an order in the prod tables | [smoke-test.mjs:19](../scripts/smoke-test.mjs#L19) | Accept for a demo, or add a TTL attribute |
| S5 | The Orders Status function has no dead-letter queue. EventBridge retries for 24 hours and then drops the event | [template.yaml:94](../template.yaml#L94) | Add `DeadLetterConfig` on the rule |
| S6 | A duplicate SQS delivery sends the "email" twice. Only the status update is idempotent | [notifications/index.js:11](../services/notifications/index.js#L11) | Idempotency key per `orderId` |
| S7 | Service folders have no lock files, so `sam build` can pick up different SDK versions between builds | `services/*/package.json` | Commit a `package-lock.json` per service |

The README already lists the larger trade-offs (dual write, client-supplied price, no auth, `Scan`, single account). Those stay as talking points and are not in scope here.

## 5. Phases

| Phase | Outcome | Time | Depends on |
|---|---|---|---|
| 0. Local prep | Node 22 active, SAM CLI installed, tests green, `.gitignore` fixed | 30 min | — |
| 1. AWS account | MFA on root, an admin identity for the CLI, budget alert, CLI works | 45 min | — |
| 2. First deploy | `mini-orders-dev` live on the default `execute-api` URL, smoke test passes | 20 min | 0, 1 |
| 3. Custom domain | Certificate issued, template updated, `https://aws-dev.hanuda.in` answers | 45 min | 2 |
| 4. GitHub and CI/CD | Repo pushed, OIDC role created, pipeline deploys dev on push | 45 min | 3 |
| 5. Production | Approval gate works, `https://aws.hanuda.in` answers | 20 min | 4 |
| 6. Hardening | S1 and S2 fixed, shipped through the pipeline | 45 min | 5 |
| 7. Demo rehearsal | Full demo done twice against prod, timed | 60 min | 5 |
| 8. Teardown | Everything deleted, DNS records removed | 15 min | after the demo |

Total: about 5 hours, comfortably split over two sittings (phases 0–3, then 4–7). The only waiting time is certificate validation, usually under 10 minutes.

## 6. Cost

At demo traffic every service here stays inside its free allowance, so the expected bill is $0 and the credit is untouched. The certificate and the API Gateway custom domain are free.

Two things can cost money:

1. **Abuse of the public URL** (gap G6). The lower throttle and the budget alert cover this.
2. **Forgetting to tear down.** Idle cost is near zero, but credits on newer AWS accounts expire. Check the expiry date in Billing → Credits.

Accounts created after July 2025 are on either a "free plan" or a "paid plan". On the free plan the account closes when the credit runs out or after 6 months. Check which one you have in the Billing console before Phase 1, because it changes what happens at the end of the credit.

## 7. Definition of done

- [ ] `curl https://aws.hanuda.in/products` returns `{"items":[...]}` with a valid certificate
- [ ] `API_URL=https://aws.hanuda.in npm run smoke` prints `All smoke tests passed`
- [ ] A push to `main` deploys dev without touching the laptop
- [ ] Prod deploy waits for your approval in GitHub
- [ ] An order with `fail@example.com` lands in the dead-letter queue and the alarm goes red
- [ ] X-Ray trace map shows the whole path
- [ ] Budget alert email confirmed
- [ ] Demo rehearsed twice, under 10 minutes
