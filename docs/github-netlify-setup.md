# GitHub + Netlify setup — Conditional Access Simulator

**Audience:** you, on a Mac, using GitHub Desktop. No terminal required at any point.
**Time:** about 45 minutes for Parts A–D, another 30 for the hardening in Part F.
**Outcome:** every save you make ends up on a public HTTPS URL, with previews for work in
progress and one-click rollback when you break something.

---

## Summary

You are setting up a three-piece pipeline. Understanding the pieces matters more than the clicks,
because when something breaks you need to know *which* piece to look at.

| Piece | What it is | What it does for you |
|---|---|---|
| **Git** | Version control running on your Mac | Snapshots of your project you can return to |
| **GitHub** | Remote copy of those snapshots | Backup, history, portfolio, the trigger for deploys |
| **Netlify** | Static hosting with CI | Watches GitHub, publishes every change to a live URL |

The flow: you edit files → GitHub Desktop commits and pushes → GitHub receives the push and pings
Netlify → Netlify copies the files to its CDN → your URL updates. Typically 20–40 seconds.

## Recommendation

**Deploy an almost-empty site first, before writing a single line of the simulator.** That is the
whole point of the starter files that came with this guide.

This is not busywork. If you build the entire app and *then* wire up deployment, any failure has
a dozen possible causes — wrong publish directory, wrong file paths, a Content-Security-Policy
blocking your own scripts, a case-sensitivity mismatch that worked on macOS and fails on Netlify's
Linux servers. If you deploy a page that only says "the pipeline works" and it goes live, then
every later break is caused by the *one thing you just changed*. That is the difference between
five minutes of debugging and an evening of it.

The same instinct applies in identity work: prove the plumbing with a report-only policy before
you enforce anything.

## Reasoning: two decisions already made for you

**No build step.** The starter files are plain HTML, CSS and ES modules. Netlify copies them
straight to the CDN. There is nothing to install, nothing to compile, and no category of error
where the site works locally but the build fails in the cloud. Add a framework later if the
project genuinely outgrows this — the interesting part of this project is the policy engine, and
React would not make that part any better.

**Config in a file, not in the dashboard.** `netlify.toml` is committed to the repo. Settings
clicked into a web UI are invisible six months later and impossible to review. Settings in a file
travel with the code, show up in diffs, and can be reverted. This habit is worth building now.

---

# Part A — Accounts and tools

### A1. GitHub account

1. Go to **github.com** → **Sign up**.
2. Use an email you will still have in five years. This account is going to be linked from your
   CV and your LinkedIn.
3. **Pick the username carefully.** It becomes `github.com/<username>` and appears in every repo
   link you ever share. Something close to your real name reads better to a hiring manager than a
   handle you picked for gaming.
4. Verify your email.

### A2. Turn on two-factor authentication

**Settings** (top-right avatar) → **Password and authentication** → **Two-factor authentication**
→ **Enable**. Use an authenticator app rather than SMS.

GitHub requires 2FA for contributors, and you should not be the identity person with an
unprotected developer account. Save the recovery codes somewhere you will actually find them.

### A3. GitHub Desktop

1. **desktop.github.com** → **Download for macOS**.
2. Open the `.zip`, drag **GitHub Desktop** to Applications, launch it.
3. **Sign in to GitHub.com** → browser opens → authorise → back to the app.
4. When it asks for your name and email for commits, use your GitHub username and the email on
   your GitHub account. Mismatched email is the reason commits sometimes don't show as yours.

> **Privacy note:** your commit email is public in the repo. If you'd rather not publish your real
> address, GitHub gives you a no-reply one: **Settings → Emails → Keep my email addresses
> private**, then copy the `…@users.noreply.github.com` address it shows and paste that into
> GitHub Desktop's preferences instead.

### A4. Netlify account

1. **netlify.com** → **Sign up** → **Sign up with GitHub**.
2. Authorise. Signing up *through* GitHub means the two are already linked, which saves a step
   later.
3. The free tier is generous — 100 GB bandwidth and 300 build minutes a month. A static site of
   this size will not come close.

---

# Part B — Create the repository

### B1. Create it locally

In GitHub Desktop: **File → New repository…**

| Field | Value | Why |
|---|---|---|
| Name | `conditional-access-simulator` | Lowercase with hyphens. This becomes part of your URL. |
| Description | `Interactive simulator of Conditional Access policy evaluation` | Shows on your GitHub profile. Write it for a recruiter. |
| Local path | `~/Documents/Projects` (create the folder) | Not Desktop, not Downloads. Somewhere you'll still look in a year. |
| Initialize with README | ✅ tick | You'll replace it with the supplied one. |
| Git ignore | `Node` | You'll replace it too. |
| License | `MIT` | Lets others read and learn from it. Fine for a portfolio piece. |

Click **Create repository**.

### B2. Drop in the starter files

1. In GitHub Desktop, click **Show in Finder** (or **Repository → Show in Finder**).
2. Unzip the starter pack you were given and copy **everything inside it** into that folder —
   `index.html`, `assets/`, `docs/`, `netlify.toml`, `.gitignore`, `README.md`, `LICENSE`,
   `.github/`. Replace the README, LICENSE and `.gitignore` GitHub Desktop just created.

> **The `.github` and `.gitignore` files start with a dot, so Finder hides them.** Press
> **⌘ + Shift + .** in Finder to show hidden files, copy them, then press it again to re-hide.
> If you skip `.gitignore`, macOS will quietly commit `.DS_Store` junk files into your repo
> forever.

3. Switch back to GitHub Desktop. The **Changes** tab now lists every file.

### B3. First commit

Bottom-left of GitHub Desktop:

- **Summary:** `Add project scaffold and Netlify configuration`
- **Description:** `Static HTML/CSS/JS starter with security headers and deploy contexts. Proves the pipeline before Phase 2 begins.`
- Click **Commit to main**.

**On commit messages:** write them for the person reading the history later, which is you. Use the
imperative — "Add policy editor", not "added policy editor" or "changes". Anyone reviewing your
repo as a work sample will scroll the commit list; it reads as a record of how you think.

### B4. Publish to GitHub

1. Click **Publish repository** (top bar).
2. Name and description carry over.
3. **Untick "Keep this code private."** It's a portfolio piece — it needs to be public to be
   useful. Nothing in it is sensitive; there are no tenant details, no keys, no real user data.
4. Click **Publish repository**.

Verify: **Repository → View on GitHub**. Your files should be there, README rendering below them.

---

# Part C — Connect Netlify

1. Go to **app.netlify.com**.
2. **Add new project** → **Import an existing project**.
3. Choose **GitHub**. Authorise if prompted.
4. **Install the Netlify GitHub App** when asked. Choose **Only select repositories** and pick
   `conditional-access-simulator`.

   > Grant the narrowest access that works. Netlify has no business reading repos it isn't
   > deploying — and "least privilege on the integration, not just the user" is exactly the
   > argument you'll be making to application owners for the rest of your career.

5. Select the repository from the list.
6. **Configure the deploy settings:**

   | Field | Value |
   |---|---|
   | Branch to deploy | `main` |
   | Base directory | *(leave empty)* |
   | Build command | *(leave empty)* |
   | Publish directory | `.` |

   Netlify reads `netlify.toml` from the repo, so these should already be filled in correctly.
   If the form and the file disagree, **the file wins** — that is deliberate.

7. Click **Deploy** (labelled **Deploy `conditional-access-simulator`** or similar).
8. Watch the deploy log. It should finish in well under a minute with **Published**.

### C1. Give the site a real name

Netlify assigns something like `spontaneous-moth-4f2a1c.netlify.app`. Change it:

**Project configuration → General → Project details → Change project name**

Pick `veena-ca-simulator` or similar. Your URL becomes
`https://veena-ca-simulator.netlify.app`. This is what you'll put on your CV, so make it
readable.

---

# Part D — Prove it actually works

Open your Netlify URL. You should see the status card with:

- Stylesheet loaded → **yes**
- JavaScript loaded → **yes**
- Served over HTTPS → **yes**
- Host → your netlify.app domain

Click **Run engine smoke test**. It should report **3/3 passed**.

Then open the browser console (**⌘ + Option + J** in Chrome) and confirm it's empty. A
`Refused to load…` message there means the Content-Security-Policy is blocking something — see
the troubleshooting table.

**Now do the round trip.** In your local folder, edit `index.html` and change the tagline. In
GitHub Desktop: commit → **Push origin**. Watch the Netlify dashboard show a new deploy, then
refresh your live URL.

That loop — edit, commit, push, live — is the thing you just built. Everything after this is
refinement.

---

# Part E — The working rhythm

Do **not** commit directly to `main` from here on. `main` is your production branch; it should
always be a version of the site that works.

### For each piece of work

1. **GitHub Desktop → Current Branch → New Branch.** Name it for the work:
   `feature/policy-editor`, `fix/mfa-stacking`.
2. Build the thing. Commit as you go — several small commits beat one enormous one. If a commit
   message needs the word "and", it should probably be two commits.
3. **Publish branch** (top bar).
4. **Create Pull Request** — GitHub Desktop opens github.com with the PR form ready.
5. Within a minute, a bot comments on the PR with a **Deploy Preview** link. That's your branch,
   live on its own URL, with the real Netlify headers applied. Click through it properly.
6. Happy? **Merge pull request** → **Confirm merge** → **Delete branch**.
7. Merging into `main` triggers the production deploy automatically.
8. Back in GitHub Desktop: **Fetch origin**, switch to `main`, **Pull origin**.

### Why bother, working alone?

Three real reasons, not ceremony:

- **The Deploy Preview.** You test the actual deployed artifact before it reaches your live URL.
  Testing locally never catches path-casing, header or caching problems.
- **`main` stays deployable.** When you're mid-refactor and something urgent comes up, you can
  always show someone the live site.
- **The PR is a written record.** "Why does the engine short-circuit on block?" is answered by
  the PR description, months later, when you can no longer remember.

---

# Part F — Production hardening

Everything above gets you a working site. This part gets you a *defensible* one.

## F1. Protect the `main` branch

**GitHub repo → Settings → Rules → Rulesets → New ruleset → New branch ruleset**

- Name: `protect-main`
- Enforcement status: **Active**
- Target branches: **Add target → Include default branch**
- Enable:
  - ✅ **Restrict deletions**
  - ✅ **Block force pushes**
  - ✅ **Require a pull request before merging**

> ⚠️ **Do not tick "Require approvals" on a solo repo.** GitHub won't let you approve your own
> pull request, and you will lock yourself out of merging your own work. Turn it on the day
> someone else joins, not before.

Force-push protection is the one that actually saves you. A force push can erase history that
exists nowhere else; this makes that impossible by accident.

## F2. Deploy Previews

On by default for pull requests. Confirm at:

**Project configuration → Build & deploy → Continuous deployment → Branches and deploy contexts**

Deploy Preview URLs look like `deploy-preview-3--your-site.netlify.app`. Netlify serves them with
`X-Robots-Tag: noindex` so Google won't index half-finished work.

## F3. Branch deploys

Same screen → **Configure** → next to **Branch deploys** choose **Let me add individual branches**
and add `develop` if you adopt one. Leave it at **None** if you only ever branch for PRs — you
already get previews from those, and every extra branch deploy is another public URL to keep
track of.

## F4. Environment variables and secrets

This app has none, and that's a feature — a purely client-side simulator has nothing to leak.
When you eventually need one:

**Project configuration → Environment variables → Add a variable**

Rules worth internalising now:

- **Never** put a secret in the repo, in `netlify.toml`, or in any file the browser downloads.
  "It's minified" is not protection. Anything shipped to the browser is public.
- Scope each variable to the deploy contexts that need it. Production credentials should not be
  reachable from a Deploy Preview built off a stranger's pull request — that is a genuine and
  frequently exploited attack path.
- If you find yourself needing a secret at runtime, that logic belongs in a Netlify Function
  (server-side), not in `app.js`.

## F5. Verify the security headers

After deploying, check the headers landed. In Chrome: **DevTools → Network → click the document
request → Headers → Response Headers**. You should see `Content-Security-Policy`,
`X-Frame-Options`, `Strict-Transport-Security` and the rest.

For an external opinion, run your URL through **securityheaders.com**. The supplied
`netlify.toml` should score an A.

**The CSP is the one that will bite you.** It's set to `default-src 'self'`, which means the page
may only load resources from its own origin. The moment you add a CDN script, a Google Font, or
an inline `<script>` block, the browser silently refuses it and logs `Refused to load…` in the
console. The fix is to add that specific host to the relevant directive in `netlify.toml` —
never to delete the policy. Deliberately widening a policy one entry at a time, with a reason for
each, is the whole discipline.

## F6. HTTPS and custom domain

HTTPS is automatic — Netlify provisions a Let's Encrypt certificate for `*.netlify.app` and
renews it for you. Nothing to do.

If you later buy a domain (`veenagawade.dev`, say):

1. **Project configuration → Domain management → Add a domain**
2. Enter the domain; Netlify shows you the DNS records to create at your registrar.
3. Certificate provisioning takes a few minutes to a few hours after DNS propagates.
4. Turn on **Force HTTPS** once the certificate is live.

> The `Strict-Transport-Security` header in `netlify.toml` tells browsers to refuse plain HTTP
> for a year. Note the deliberate absence of `preload` — preloading is very hard to reverse, and
> it commits every subdomain. Leave it off until you're certain.

## F7. Rollback

**Deploys** tab → click any earlier successful deploy → **Publish deploy**.

Live within seconds, no Git operation needed. Every deploy Netlify has ever built stays
addressable at its own permanent URL. This is your undo button — knowing it exists is what lets
you deploy without hesitation.

## F8. Notifications

**Project configuration → Notifications → Add notification → Deploy failed → Email**

You want to hear about a broken deploy from your inbox, not from noticing a stale site next week.

## F9. Optional: lock production

**Deploys → Deploy settings → Locked to a specific deploy** freezes production while you carry on
merging. Useful if you ever demo the site live — you can keep working without the URL shifting
underneath you.

---

# Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Netlify shows "Page not found" | Publish directory wrong, or no `index.html` at the root | Confirm `publish = "."` in `netlify.toml` and that `index.html` is at the repo root, not in a subfolder |
| Site loads, no styling | Path case mismatch — macOS ignores case, Netlify's Linux servers don't | `Assets/CSS/Styles.css` ≠ `assets/css/styles.css`. Keep everything lowercase |
| Console: `Refused to load the script…` | Content-Security-Policy blocking an external resource | Add the host to the right directive in `netlify.toml`. Don't remove the CSP |
| Deploy succeeded but the site looks old | Browser cache | Hard refresh: **⌘ + Shift + R** |
| GitHub Desktop: "Authentication failed" | Token expired | **GitHub Desktop → Settings → Accounts → Sign out**, sign back in |
| `.DS_Store` files appearing in commits | `.gitignore` missing or not committed | Confirm `.gitignore` is in the repo root and shows in the GitHub file list |
| Deploy never triggers on push | Netlify GitHub App lost repo access | **Project configuration → Build & deploy → Continuous deployment → Manage repository** |
| Can't merge your own PR | You enabled "Require approvals" on a solo repo | Edit the ruleset and turn approvals off |

---

# Where Phase 2 begins

Once your live URL shows the status card and the smoke test passes, you are done here. Then:

1. Paste your Phase 1 design spec into `docs/phase1-spec.md`, commit, push. Having it *in the
   repo* means every future prompt can start with "read `docs/phase1-spec.md`" instead of you
   re-explaining the design from memory — which is exactly the failure that cost you this
   session's context.
2. Create a branch: `feature/policy-model`.
3. Start Phase 2 with the data model and the evaluation engine — **before** any UI. The engine is
   pure logic, it's testable, and it's the part that demonstrates you understand Conditional
   Access. The UI is a viewer for it.
4. Delete the placeholder `evaluate()` in `assets/js/app.js` when the real one lands.

---

# Blind spots worth naming

- **Case sensitivity** is the single most common "works locally, broken live" cause on macOS.
  Lowercase everything, always.
- **You now have two public artifacts**, the repo and the site. Both are portfolio pieces. A
  clean commit history and a README that explains the *reasoning* are worth more to an
  interviewer than another 200 lines of code.
- **Label it clearly as a simulation.** Anything that looks like it might mirror real Microsoft
  behaviour needs an unmistakable disclaimer — it's in the README and the page footer already.
  Keep it there.
- **This scales to real work.** The same GitHub-plus-CI pattern is how mature identity teams
  manage Conditional Access policy-as-code: policies in Git, changes via pull request, automated
  validation, deploy to the tenant. You're rehearsing the workflow, not just hosting a page.
