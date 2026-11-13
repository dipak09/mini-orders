# Interview answer: "Describe a security problem you found in a system and how you fixed it"

> **Make it true before you say it.** Every step below is real in this repo, but the proof is not done yet. Finish [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) steps 4.3–4.5 and take the two screenshots in 4.5. Then everything you say is something you did and can show.

---

## The answer (about 2 minutes, STAR format)

**Situation.**
I built a small event-driven order system on AWS: three Node.js services on Lambda, with DynamoDB, EventBridge and SQS, deployed by a GitHub Actions pipeline. Dev deploys automatically from `main`, and prod needs my approval. The pipeline's AWS identity is powerful: PowerUser access plus permission to create IAM roles for the app.

**Task.**
Before putting it on a public URL, I reviewed the pipeline's trust boundary. The question I asked was: *who, exactly, can get these AWS credentials?*

**Action — first finding.**
My original design used GitHub OIDC, so there were no stored keys. The deploy role's trust policy matched the token's subject against `repo:<me>/mini-orders:environment:*`. The intent was "only my `dev` and `production` environments". But GitHub creates an environment automatically the first time a workflow names one. So anyone with push access to *any branch* could write `environment: anything` and get PowerUser credentials. That bypassed code review and the prod approval gate. I fixed it with exact `StringEquals` matches on the two environments.

**Action — then the platform changed the problem.**
When I deployed that role, AWS refused to create the OIDC provider. My account is one of AWS's new "project" accounts, and an AWS-managed service control policy denies `iam:*Provider*` on both the free and the paid plan. So I *had* to use a long-lived access key, which is the thing OIDC was meant to avoid.

Rather than just pasting the key into GitHub, I asked the same question again: who can read it? The default, a repository secret, is readable by a workflow on any branch, so it's the same hole in a different place. I closed it in four layers:

1. **Environment secrets only.** The key lives only in the `dev` and `production` GitHub environments, never as a repository secret.
2. **Branch fence.** Both environments accept jobs only from `main`, so code has to be reviewed and merged before it can touch the key. Prod also needs my approval.
3. **Blast radius.** It's a dedicated deploy-only IAM user, with an explicit deny on creating users or keys and on changing its own policies. A leaked key can't make itself stronger or persist.
4. **No exposure on the way in.** I scripted the setup so the key goes straight from `aws iam create-access-key` into `gh secret set`. It is never printed, saved to a file or shown in CloudFormation outputs.

**Result — how I proved it.**
I pushed a feature branch with a probe workflow that tried both routes. The job that tried to enter the `dev` environment was rejected by GitHub's protection rule. The job that tried to read the secret without an environment got an empty value and couldn't authenticate. The real `main` → dev → approve → prod pipeline kept working.

**What I'd do next** (only if asked, or to close strongly):
key rotation on a schedule, a CloudTrail alert on any use of that key outside GitHub's IP ranges, and a scoped policy instead of PowerUser. And on an account that allows it, I'd go back to OIDC.

**The lesson:** the question is never "keys or no keys". It's "who can obtain a credential, and through which path?" I hit the same hole twice, once in an IAM trust policy and once in GitHub's secret scoping, and the same question found it both times.

---

## 30-second version

> "Reviewing my CI/CD pipeline before going public, I asked who could actually get its AWS credentials. First, the OIDC trust policy used `environment:*`. Because GitHub creates environments on demand, any branch could get PowerUser access. I fixed that with exact matches. Then my AWS account turned out to block OIDC entirely, so I had to use an access key. A repo-level secret would have reopened the same hole, so I put it only in environment secrets fenced to `main` with prod approval, used a deploy-only user that can't escalate itself, and scripted the key straight into GitHub without it ever being printed. I proved it with a probe workflow from a feature branch: both attempts were denied."

---

## Likely follow-up questions

| Question | Answer |
|---|---|
| How did you find it? | A deliberate review before going public. I listed every path to credentials and tested each one, instead of assuming the defaults were safe |
| Why was it serious? | The identity can create IAM roles and change most resources. A compromised contributor account could take over the AWS account or run up a bill, with no review |
| Why not just use a repository secret? | Any workflow on any branch in the repo can read it. Environment secrets plus branch rules mean only reviewed code on `main` can |
| Isn't a long-lived key worse than OIDC? | Yes, and I'd use OIDC wherever the platform allows it. Here it was blocked, so I reduced who can read the key, what it can do, and how it could leak |
| What if the key leaks anyway? | It can't create more users or keys or change its own policy, so the attacker can't persist. Revocation is one command: delete the key. CloudTrail shows every call it made |
| How do you rotate it? | Delete the key and re-run the setup script, which creates a new key and overwrites the GitHub secrets. That's under a minute |
| What about pull requests from forks? | Fork PRs don't receive secrets, and the PR job in my pipeline has no environment and needs no AWS access |
| Why does `environment:*` matter if environments need admin to create? | They don't. Referencing a non-existent environment in a workflow creates it, with no protection rules |
| How would you catch this automatically? | IAM Access Analyzer policy checks in CI, a lint rule against wildcards in OIDC `sub` conditions, and a check that no AWS credentials exist as repository secrets |
| Any other issues you found? | Yes: the API is public and unauthenticated, so I lowered the throttle to 5 requests/second and added a budget alert. And a local tool's credentials file wasn't gitignored, so I added it before the first commit |

---

## Delivery tips

- Lead with the *question you asked* ("who can get these credentials?"). It shows a method, not luck.
- The twist (the platform blocked OIDC) is your strongest part. It shows you can keep security intact under a constraint instead of giving up on it.
- Name the proof. "A probe from a feature branch was denied" separates a real fix from a config change. Have the screenshots ready.
- Don't oversell. Saying "a key is still worse than OIDC; here's what I'd add" makes you more credible.
