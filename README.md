# Conditional Access Simulator

An interactive, browser-only simulator of Conditional Access policy evaluation. Define a set of
policies, describe a sign-in attempt, and see whether access is **granted**, **blocked**, or
**granted with requirements** — along with a per-policy explanation of why.

> **Educational project.** It models Conditional Access *concepts* in simplified form. It is not
> affiliated with or endorsed by Microsoft, does not connect to any tenant, and must not be used
> to predict the behaviour of a production policy set.

**Live site:** _add your Netlify URL here after the first deploy_

---

## Why this exists

Conditional Access is easy to configure and hard to reason about. The interesting part is not the
UI — it is the evaluation model:

- Every enabled policy whose conditions match the sign-in is in scope.
- **A block decision wins outright.** No amount of grant controls overrides it.
- Otherwise, the grant requirements of every matching policy **stack** — the user must satisfy all
  of them, not just the strictest one.

This project makes that model visible and testable.

## Architecture

Deliberately dependency-free: plain HTML, CSS and ES modules. No framework, no bundler, no build
step. The engine is the substance of the project; a build pipeline would only add failure modes
between a commit and a live site.

```
index.html              entry point
assets/css/styles.css   styles (system font stack, no external fonts)
assets/js/app.js        bootstrap + evaluation engine
netlify.toml            build config, security headers, deploy contexts
docs/                   design spec and roadmap
```

## Running locally

No tooling required — open `index.html` in a browser.

For ES modules and correct path resolution, prefer a local server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deployment

Every push to `main` deploys to production automatically. Every pull request gets its own
Deploy Preview URL. See `docs/github-netlify-setup.md` for the full setup.

## Security notes

The app processes no real identity data and stores nothing server-side. The
`Content-Security-Policy` in `netlify.toml` is `default-src 'self'` — if you add a CDN script or
external font, add that host to the policy rather than removing it.

## Roadmap

- [x] Phase 0 — Conditional Access fundamentals
- [x] Phase 1 — design spec (attributes, rule structure, decision logic)
- [ ] Phase 2 — project setup and first deployable page
- [ ] Phase 3 — policy editor
- [ ] Phase 4 — evaluation engine + explanation trace
- [ ] Phase 5 — persistence, import/export
- [ ] Phase 6 — polish, tests, write-up

## Licence

MIT — see `LICENSE`.
