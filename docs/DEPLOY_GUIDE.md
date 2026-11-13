# Mini Orders — Step-by-step Deploy Guide

Follow the phases in order. Each step has a check, so you know it worked before you move on. The overall plan and the reasons are in [PROJECT_PLAN.md](PROJECT_PLAN.md).

Placeholders used below. Replace them whenever you see them:

| Placeholder | Meaning |
|---|---|
| `<ACCOUNT_ID>` | Your 12-digit AWS account ID |
| `<GH_USER>` | Your GitHub username |
| `<CERT_ARN>` | The certificate ARN from Phase 3 |
| `<API_ID>` | The random ID in the default API URL |

All commands run from the project root, `/var/www/claude/mini-orders`.

---

## Phase 0 — Local prep (30 min)

**0.1 Switch to Node 22.** It is already installed in nvm.

```bash
nvm use 22
nvm alias default 22
node -v          # expect v22.x
```

**0.2 Install the SAM CLI** (Linux x86_64).

```bash
cd /tmp
curl -L https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip -o sam.zip
unzip sam.zip -d sam-installation
sudo ./sam-installation/install
sam --version    # expect "SAM CLI, version 1.x"
cd /var/www/claude/mini-orders
```

**0.3 Keep `.jetro/` out of git.** Add this line to `.gitignore`:

```
.jetro/
```

**0.4 Run the tests.**

```bash
npm ci
npm test         # expect: Tests: 17 passed, 17 total
```

**Check:** `node -v` shows 22, `sam --version` prints a version, tests are green.

---

## Phase 1 — AWS account (45 min)

Do steps 1.1 to 1.4 in the AWS web console.

**1.1 Secure the root user.**
1. Sign in as root at https://console.aws.amazon.com.
2. Top-right account menu → **Security credentials**.
3. Under **Multi-factor authentication** → **Assign MFA device** → Authenticator app → scan the QR code → enter two codes.

**1.2 Check the plan and the credit.**
1. Search bar → **Billing and Cost Management**.
2. Left menu → **Credits**. Note the amount and the **expiry date**.
3. On the Billing home page, note whether the account is on the **free plan** or the **paid plan**.

**1.3 Create a budget alert.**
1. Billing → **Budgets** → **Create budget**.
2. Choose **Use a template** → **Zero spend budget**.
3. Enter your email → **Create budget**.
4. Create a second one: template **Monthly cost budget**, amount `5` USD, same email.

**1.4 Create an admin identity for the CLI.** Do not use root keys.
1. Search bar → **IAM** → **Users** → **Create user**.
2. Name: `admin-cli`. Leave console access unticked. **Next**.
3. **Attach policies directly** → tick `AdministratorAccess` → **Next** → **Create user**.
4. Open the user → **Security credentials** tab → **Create access key** → **Command Line Interface (CLI)** → tick the confirmation → **Create**.
5. Keep this page open for the next step. The secret is shown only once.

(IAM Identity Center with `aws configure sso` is the better long-term option. An IAM user is quicker for a short-lived demo account. Delete the key in Phase 8.)

**1.5 Configure the CLI** (terminal).

```bash
aws configure
# AWS Access Key ID:     paste
# AWS Secret Access Key: paste
# Default region name:   ap-south-1
# Default output format: json

aws sts get-caller-identity
```

**Check:** the last command prints your account ID and `user/admin-cli`. Write the account ID down as `<ACCOUNT_ID>`.

---

## Phase 2 — First deploy to dev (20 min)

**2.1 Validate and build.**

```bash
sam validate --lint     # expect: "is a valid SAM Template"
sam build               # expect: "Build Succeeded"
```

**2.2 Deploy.** This uses `samconfig.toml`, so the stack is `mini-orders-dev` in `ap-south-1`.

```bash
sam deploy
```

It takes about 3 minutes. At the end it prints an **Outputs** table. Copy the `ApiUrl` value.

**2.3 Smoke test.**

```bash
API_URL=https://<API_ID>.execute-api.ap-south-1.amazonaws.com npm run smoke
```

**Check:** five `PASS` lines, then `All smoke tests passed`.

If it fails:

| Symptom | Cause | Fix |
|---|---|---|
| `Unable to locate credentials` | Phase 1.5 not done in this shell | Run `aws configure` again |
| `ROLLBACK_COMPLETE` | A resource failed to create | Console → CloudFormation → stack → **Events** tab, read the first red row. Then `sam delete --stack-name mini-orders-dev` and redeploy |
| Smoke test stuck before "confirmed asynchronously" | The event path is broken | Console → CloudWatch → Log groups → the Notifications function log |

---

## Phase 3 — Custom domain (45 min)

### 3.1 Request the certificate

One certificate covers both names. It must be in `ap-south-1`, the same region as the API.

```bash
aws acm request-certificate \
  --domain-name aws.hanuda.in \
  --subject-alternative-names aws-dev.hanuda.in \
  --validation-method DNS \
  --region ap-south-1
```

Copy the `CertificateArn` from the output. That is `<CERT_ARN>`.

### 3.2 Get the validation records

```bash
aws acm describe-certificate --certificate-arn <CERT_ARN> --region ap-south-1 \
  --query "Certificate.DomainValidationOptions[].ResourceRecord" --output table
```

You get two rows, one per name. Each has a **Name** (starts with `_`) and a **Value** (ends with `acm-validations.aws.`).

### 3.3 Add the validation records in Cloudflare

1. https://dash.cloudflare.com → select `hanuda.in` → **DNS** → **Records** → **Add record**.
2. Type: `CNAME`.
3. Name: paste the Name from 3.2. Cloudflare trims the `.hanuda.in.` ending by itself.
4. Target: paste the Value. Remove the trailing dot if Cloudflare rejects it.
5. Proxy status: click the cloud so it is **grey (DNS only)**. Validation fails with the orange cloud.
6. **Save**. Repeat for the second row.

### 3.4 Wait until the certificate is issued

```bash
aws acm wait certificate-validated --certificate-arn <CERT_ARN> --region ap-south-1
aws acm describe-certificate --certificate-arn <CERT_ARN> --region ap-south-1 \
  --query Certificate.Status --output text      # expect ISSUED
```

Usually 2 to 10 minutes. If it is still `PENDING_VALIDATION` after 30 minutes, the records are wrong or proxied. Also check that `hanuda.in` has no CAA record that excludes Amazon (Cloudflare → DNS → look for type `CAA`).

### 3.5 Edit `template.yaml`

Four edits.

**a)** Under `Parameters:`, after the `Stage` block, add the two parameters and a new `Conditions:` section:

```yaml
  DomainName:
    Type: String
    Default: ''
    Description: Custom domain for the API, e.g. aws.hanuda.in. Empty = no custom domain
  CertificateArn:
    Type: String
    Default: arn:aws:acm:ap-south-1:000000000000:certificate/not-set
    Description: ACM certificate in this region. Only used when DomainName is set

Conditions:
  HasDomain: !Not [!Equals [!Ref DomainName, '']]
```

**b)** In the `HttpApi` resource, lower the throttle so a public URL cannot burn credit:

```yaml
      DefaultRouteSettings:
        ThrottlingBurstLimit: 10
        ThrottlingRateLimit: 5
```

**c)** Directly after the `HttpApi` resource, add:

```yaml
  ApiDomain:
    Type: AWS::ApiGatewayV2::DomainName
    Condition: HasDomain
    Properties:
      DomainName: !Ref DomainName
      DomainNameConfigurations:
        - CertificateArn: !Ref CertificateArn
          EndpointType: REGIONAL
          SecurityPolicy: TLS_1_2

  ApiDomainMapping:
    Type: AWS::ApiGatewayV2::ApiMapping
    Condition: HasDomain
    DependsOn: HttpApiApiGatewayDefaultStage
    Properties:
      ApiId: !Ref HttpApi
      DomainName: !Ref ApiDomain
      Stage: $default
```

**d)** Under `Outputs:`, add:

```yaml
  CustomDomainTarget:
    Condition: HasDomain
    Description: Point the Cloudflare CNAME at this
    Value: !GetAtt ApiDomain.RegionalDomainName
```

The placeholder default on `CertificateArn` is deliberate. An empty default makes `sam validate --lint` report warning W1030.

### 3.6 Edit `samconfig.toml`

Change the `parameter_overrides` line to:

```toml
parameter_overrides = "Stage=dev DomainName=aws-dev.hanuda.in CertificateArn=<CERT_ARN>"
```

### 3.7 Deploy and read the CNAME target

```bash
sam validate --lint
sam build && sam deploy

aws cloudformation describe-stacks --stack-name mini-orders-dev --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CustomDomainTarget'].OutputValue" --output text
```

The output looks like `d-abc123xyz.execute-api.ap-south-1.amazonaws.com`.

### 3.8 Add the domain record in Cloudflare

1. Cloudflare → `hanuda.in` → **DNS** → **Add record**.
2. Type `CNAME`, Name `aws-dev`, Target = the value from 3.7.
3. Proxy status: **grey (DNS only)**.
4. **Save**.

### 3.9 Verify

```bash
dig +short aws-dev.hanuda.in                 # expect the d-xxxx name, then IP addresses
curl -s https://aws-dev.hanuda.in/products   # expect {"items":[...]}
API_URL=https://aws-dev.hanuda.in npm run smoke
```

| Symptom | Cause | Fix |
|---|---|---|
| `Could not resolve host` | DNS not propagated yet | Wait 1 to 2 minutes |
| `{"message":"Not Found"}` on every path | API mapping missing | Console → API Gateway → Custom domain names → the domain → **API mappings** |
| Certificate error | Cloudflare proxy is on with SSL mode "Flexible" | Set the record to DNS only |
| `{"message":"Forbidden"}` | CNAME points at the `<API_ID>.execute-api` URL | Point it at the `d-xxxx` value from 3.7 |

---

## Phase 4 — GitHub and CI/CD (45 min)

### 4.1 Create the deploy role (one time)

First, tighten the trust policy (gap G8). In [infra/github-oidc.yaml](../infra/github-oidc.yaml), replace the `Condition:` block of `DeployRole` with:

```yaml
            Condition:
              StringEquals:
                token.actions.githubusercontent.com:aud: sts.amazonaws.com
                token.actions.githubusercontent.com:sub:
                  - !Sub repo:${GitHubOrg}/${RepoName}:environment:dev
                  - !Sub repo:${GitHubOrg}/${RepoName}:environment:production
```

The original `environment:*` lets a workflow on any branch invent an environment name and get the role.

```bash
aws cloudformation deploy --template-file infra/github-oidc.yaml \
  --stack-name mini-orders-github-oidc --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides GitHubOrg=<GH_USER> \
  --region ap-south-1

aws cloudformation describe-stacks --stack-name mini-orders-github-oidc --region ap-south-1 \
  --query "Stacks[0].Outputs[0].OutputValue" --output text
```

Copy the printed ARN (`arn:aws:iam::<ACCOUNT_ID>:role/mini-orders-github-deploy`).

`GitHubOrg` is case-sensitive and must match your GitHub username exactly. The repo must be named `mini-orders`, or pass `RepoName=<name>` as well.

### 4.2 Pass the domain through the pipeline

Without this, the first pipeline run deploys with an empty `DomainName` and deletes the custom domain you just created.

In `.github/workflows/ci-cd.yml`, change both `sam deploy` commands.

Dev job:

```yaml
      - run: >
          sam deploy --stack-name mini-orders-dev
          --parameter-overrides Stage=dev DomainName=${{ vars.DOMAIN_NAME }} CertificateArn=${{ vars.CERTIFICATE_ARN }}
          --capabilities CAPABILITY_IAM --resolve-s3
          --no-confirm-changeset --no-fail-on-empty-changeset
```

Prod job: the same, with `mini-orders-prod` and `Stage=prod`.

### 4.3 Create the repo and push

```bash
git init -b main
git add .
git status                 # confirm .jetro/, node_modules/, .aws-sam/ are NOT listed
git commit -m "Initial commit: mini-orders"

gh auth login              # if not already logged in
gh repo create mini-orders --private --source=. --remote=origin
```

Do not push yet. Set up the repo first, or the first run fails.

A private repo on a free GitHub plan cannot use **required reviewers** on environments. If the approval option is missing in 4.4, make the repo public (`gh repo edit --visibility public --accept-visibility-change-consequences`). The certificate ARN and account ID in `samconfig.toml` are identifiers, not secrets, but look through the files once before going public.

### 4.4 Configure the repo on github.com

1. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Name `AWS_DEPLOY_ROLE_ARN`, value = the ARN from 4.1.
2. **Settings** → **Environments** → **New environment** → name `dev` → **Configure environment**.
   - Under **Environment variables** add `DOMAIN_NAME` = `aws-dev.hanuda.in` and `CERTIFICATE_ARN` = `<CERT_ARN>`.
3. **New environment** → name `production` (exactly this spelling, the workflow uses it).
   - Tick **Required reviewers**, add yourself, **Save protection rules**.
   - Add `DOMAIN_NAME` = `aws.hanuda.in` and `CERTIFICATE_ARN` = `<CERT_ARN>`.
4. For **both** environments: **Deployment branches and tags** → **Selected branches and tags** → add rule `main`. Only `main` can then run a job in `dev` or `production`.

### 4.4b Prove the trust policy fix (5 min, after 4.5 is green)

This is the evidence for the interview answer.

```bash
git checkout -b oidc-test
mkdir -p .github/workflows
cat > .github/workflows/oidc-test.yml <<'EOF'
name: oidc-test
on: push
permissions: { id-token: write, contents: read }
jobs:
  probe:
    runs-on: ubuntu-latest
    environment: test
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: "${{ secrets.AWS_DEPLOY_ROLE_ARN }}", aws-region: ap-south-1 }
EOF
git add .github/workflows/oidc-test.yml && git commit -m "test: oidc probe" && git push -u origin oidc-test
gh run watch
```

**Expected:** the job fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity`. Take a screenshot. Then clean up:

```bash
git checkout main
git push origin --delete oidc-test && git branch -D oidc-test
```

Delete the auto-created `test` environment in **Settings → Environments**.

### 4.5 Push and watch

```bash
git push -u origin main
gh run watch
```

**Check:** the `test` job is green, `deploy-dev` is green, and `deploy-prod` shows **Waiting** for review.

| Symptom | Cause | Fix |
|---|---|---|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | `GitHubOrg` or repo name does not match, or the environment name is wrong | Redeploy 4.1 with the exact username |
| `Could not load credentials` | Secret name misspelled | Must be `AWS_DEPLOY_ROLE_ARN` |
| Custom domain disappeared after the run | Environment variables from 4.4 are missing | Add them, re-run the job |

---

## Phase 5 — Production (20 min)

**5.1 Approve.** GitHub → **Actions** → the waiting run → **Review deployments** → tick `production` → **Approve and deploy**. About 3 minutes.

**5.2 Read the prod CNAME target.**

```bash
aws cloudformation describe-stacks --stack-name mini-orders-prod --region ap-south-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CustomDomainTarget'].OutputValue" --output text
```

**5.3 Cloudflare record.** Add record → `CNAME`, Name `aws`, Target = the value from 5.2, **grey cloud**, Save.

**5.4 Verify.**

```bash
curl -s https://aws.hanuda.in/products
API_URL=https://aws.hanuda.in npm run smoke
```

**Check:** `All smoke tests passed` against `aws.hanuda.in`.

---

## Phase 6 — Hardening (45 min, optional but worth it)

Do these as one pull request, so you also exercise the PR path of the pipeline (`git checkout -b hardening`, commit, `gh pr create`, merge).

**6.1 Do not lose events silently** (finding S1). In [services/orders/api.js](../services/orders/api.js) and [services/notifications/index.js](../services/notifications/index.js), keep the `PutEvents` result and check it:

```js
const res = await eb.send(new PutEventsCommand({ /* unchanged */ }));
if (res.FailedEntryCount > 0) throw new Error(`PutEvents failed: ${res.Entries?.[0]?.ErrorCode}`);
```

The existing tests already mock `FailedEntryCount: 0`, so they keep passing. Add one test per service for the failure case.

**6.2 Make the alarm email you** (finding S2). In `template.yaml` add a parameter `AlarmEmail` (String, default `''`), then:

```yaml
  AlarmTopic:
    Type: AWS::SNS::Topic
    Properties:
      Subscription:
        - { Protocol: email, Endpoint: !Ref AlarmEmail }
```

and on `DLQAlarm` add `AlarmActions: [!Ref AlarmTopic]`. Pass `AlarmEmail=<your email>` in the parameter overrides, the same way as the domain. After the deploy, click **Confirm subscription** in the email from AWS.

**Check:** `npm test` and `sam validate --lint` pass, the pipeline is green.

---

## Phase 7 — Demo rehearsal (60 min)

Open these browser tabs before you start:

1. GitHub → Actions (the last green run)
2. AWS console → CloudFormation → `mini-orders-prod` → Resources
3. AWS console → CloudWatch → **X-Ray traces → Trace map**
4. AWS console → CloudWatch → Alarms
5. AWS console → SQS → the dead-letter queue

### Running order (about 8 minutes)

```bash
API=https://aws.hanuda.in
```

**Step 1. Start the failure case first.** It needs about 4 minutes to show up: 3 attempts, 60 seconds apart, then up to a minute for the alarm. Fire it and move on.

```bash
curl -s -X POST $API/orders -H 'content-type: application/json' \
  -d '{"customerEmail":"fail@example.com","items":[{"productId":"p1","quantity":1,"unitPrice":5}]}'
```

**Step 2. Architecture** (1 minute). Show the diagram in the README. Say: 3 services, each owns its data, they talk only through events.

**Step 3. Happy path.**

```bash
curl -s -X POST $API/products -H 'content-type: application/json' \
  -d '{"name":"Mechanical Keyboard","price":49.99}'
# copy "id" from the response

curl -s -X POST $API/orders -H 'content-type: application/json' \
  -d '{"customerEmail":"demo@example.com","items":[{"productId":"<id>","quantity":2,"unitPrice":49.99}]}'
# status is PENDING. copy "id"

curl -s $API/orders/<orderId>
# status is CONFIRMED, with confirmedAt
```

**Step 4. Validation.**

```bash
curl -s -X POST $API/orders -H 'content-type: application/json' -d '{"customerEmail":"nope","items":[]}'
# 400
```

**Step 5. Observability.** Trace map tab: API Gateway does not appear, the four functions, two tables, the bus and the queue do. Then Logs Insights on the Orders log group:

```
fields @timestamp, level, msg, orderId | filter service = "orders" | sort @timestamp desc | limit 20
```

**Step 6. CI/CD.** Actions tab: test → dev → approval → prod. Point out there are no AWS keys in the repo secrets, only a role ARN.

**Step 7. Back to the failure.** Alarms tab: the alarm is red. SQS tab: 1 message in the dead-letter queue. `GET /orders/<id>` for that order still says `PENDING`. Say what you would add (finding S3).

### Questions to prepare for

| Question | Short answer |
|---|---|
| Why SQS between EventBridge and Lambda? | Buffering, retries with a limit, and a dead-letter queue per consumer |
| What if the event is published twice? | The status update is a conditional write, so the second one does nothing |
| What if the order saves but the publish fails? | The order is stuck in `PENDING`. Fix is a transactional outbox: DynamoDB Streams → EventBridge Pipes |
| Why not ECS or EKS? | Small, spiky workload, nothing to patch. Same events and tables would work behind Fargate |
| How is the pipeline authenticated? | GitHub OIDC. The role trusts only this repo's environments. Tokens last one hour |
| Is the deploy role least privilege? | No. It is PowerUser plus IAM limited to `mini-orders-*` roles. In production it would be a scoped policy or a CloudFormation service role |
| How are dev and prod separated? | Separate stacks in one account here. Separate accounts in production |
| What does it cost? | About $0 idle. Everything is pay-per-request |
| Is the API open to the world? | Yes, with a 5 requests/second throttle. Next step is a JWT authorizer |

Rehearse the whole thing twice. Clear the dead-letter queue between runs (SQS → queue → **Purge**), or the alarm is already red when you start.

---

## Phase 8 — Teardown (15 min)

Order matters. Remove DNS first: a CNAME left pointing at a deleted API Gateway domain can be claimed by someone else.

1. **Cloudflare:** delete the `aws` and `aws-dev` CNAME records and the two `_...` validation records.
2. **Stacks:**
   ```bash
   sam delete --stack-name mini-orders-prod --region ap-south-1
   sam delete --stack-name mini-orders-dev  --region ap-south-1
   aws cloudformation delete-stack --stack-name mini-orders-github-oidc --region ap-south-1
   ```
3. **Certificate:**
   ```bash
   aws acm delete-certificate --certificate-arn <CERT_ARN> --region ap-south-1
   ```
4. **SAM's deployment bucket:** console → S3 → the bucket starting with `aws-sam-cli-managed-default` → **Empty** → then CloudFormation → delete the stack `aws-sam-cli-managed-default`.
5. **Access key:** IAM → Users → `admin-cli` → Security credentials → delete the access key.
6. **Check:** Billing → Bills, a day later, shows $0 for the month.
