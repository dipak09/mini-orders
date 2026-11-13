# Interview answer: "Describe a security problem you found in a system and how you fixed it"

> **Make it true before you say it.** This story is based on a real flaw in this repo's [infra/github-oidc.yaml](../infra/github-oidc.yaml). The fix is in [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md), steps 4.1 and 4.4. Apply it and run the check in "How I proved it" yourself, so every detail you say is something you did.

---

## The answer (about 2 minutes, STAR format)

**Situation.**
I built a small event-driven order system on AWS: three Node.js services on Lambda, with DynamoDB, EventBridge and SQS, deployed by a GitHub Actions pipeline. Dev deploys automatically from `main`, and prod needs a manual approval.

For the pipeline's AWS access I'd already avoided long-lived access keys. GitHub Actions authenticates with OIDC: each job gets a short-lived token from GitHub, and AWS swaps it for temporary credentials on a deploy role. That role is powerful. It has PowerUser access plus permission to create IAM roles for the app.

**Task.**
Before putting it on a public URL I reviewed the pipeline's trust boundary. The question I asked was: *who, exactly, can get these AWS credentials?*

**Action — what I found.**
The role's trust policy checked the token's `sub` claim against this pattern:

```
repo:<me>/mini-orders:environment:*
```

The intent was "only jobs running in my `dev` or `production` GitHub environments". But the wildcard matches **any** environment name, and GitHub creates an environment automatically the first time a workflow refers to one that doesn't exist. Nothing restricted which branches could use the `dev` environment either.

So anyone with push access to *any branch* could add a workflow with `environment: anything`, run it, and get PowerUser credentials in my AWS account. That skipped code review, the `main`-only rule and the prod approval gate entirely. The approval gate looked like a control, but the credentials were reachable without going through it.

**Action — how I fixed it.** Three layers:

1. **Exact match in AWS.** I replaced the wildcard with the two exact subjects, `...:environment:dev` and `...:environment:production`, using `StringEquals` instead of `StringLike`. Made-up environment names no longer match.
2. **Branch rules in GitHub.** I restricted both environments to deploy only from `main`. A feature branch can't run a job in `dev` or `production` at all, so code has to be reviewed and merged first.
3. **Prod approval stays.** The `production` environment still needs a required reviewer, and now it actually guards the credentials.

**Result — how I proved it.**
I didn't just trust the policy. I pushed a test branch with a workflow that used `environment: test` and tried to assume the role. Before the fix it got credentials. After the fix it failed with `Not authorized to perform sts:AssumeRoleWithWebIdentity`. The normal `main` → dev → approve → prod pipeline kept working.

**What I'd do next** (only if asked, or to close strongly):
the role is still broader than it should be. The next steps are a separate role per environment, so the dev role can only touch `mini-orders-dev` stacks, and replacing PowerUser with a scoped policy or a CloudFormation service role.

**The lesson I took away:** "we use OIDC, so there are no keys" isn't the end of the security story. OIDC moves the risk from *protecting a secret* to *writing the trust policy correctly*, and a wildcard there is as dangerous as a leaked key.

---

## 30-second version

> "In my AWS project the CI/CD pipeline used GitHub OIDC instead of access keys, which is good. But reviewing the deploy role's trust policy, I saw it allowed `environment:*`. GitHub creates environments on demand, so anyone who could push any branch could get PowerUser credentials and bypass review and the prod approval gate. I fixed it in two places: exact `StringEquals` on the dev and production subjects in AWS, and `main`-only deployment branch rules in GitHub. Then I proved it by trying from a test branch. Access was denied, and the real pipeline still worked."

---

## Likely follow-up questions

| Question | Answer |
|---|---|
| How did you find it? | A deliberate review before going public. I listed every path to AWS credentials and checked each one, instead of assuming OIDC made it safe |
| Why was it so bad? | The role could create IAM roles and change most resources. A malicious or compromised contributor account could take over the account or run up a bill, with no review |
| Why not just restrict branches in GitHub? | GitHub settings can be changed by repo admins and are easy to miss. The AWS trust policy is the boundary that actually issues credentials, so it has to be strict on its own. I used both |
| Why not `ref:refs/heads/main` as the subject? | When a job uses an environment, GitHub puts the environment in `sub`, not the branch. So the environment name is what the policy can see; branch rules on the environment cover the branch side |
| What about pull requests from forks? | Fork PRs don't get an OIDC token with `id-token: write` from the base repo's secrets context, and the PR job in my pipeline has no environment and no AWS permission anyway |
| What is "audience" (`aud`)? | The intended receiver of the token. It's checked to equal `sts.amazonaws.com`, so a GitHub token minted for some other service can't be replayed against AWS |
| How would you catch this automatically? | IAM Access Analyzer policy checks in CI, and a lint rule that fails on wildcards in OIDC `sub` conditions |
| Any other issues you found? | Yes: the API is public and unauthenticated, so I lowered the throttle to 5 requests/second and added a budget alert to cap cost abuse. And a local tool's credentials file wasn't gitignored, so I added it before the first commit |

---

## Delivery tips

- Lead with the *question you asked* ("who can get these credentials?"). It shows a method, not luck.
- Say the impact in plain words: "anyone who could push a branch could get admin-level AWS access".
- Name the proof. "I tested it from a branch and it was denied" is what separates a real fix from a config change.
- Don't oversell. Saying "the role is still too broad, here's what's next" makes you more credible, not less.
