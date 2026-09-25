# Conditional Access Simulator

An interactive, browser-only simulator of Conditional Access policy evaluation. Define a set of policies, describe a sign-in attempt, and see whether access is **allowed**, **blocked**, blocked because a requirement cannot be satisfied, or **allowed subject to a challenge** — along with a per-policy explanation of why.

> **Educational project.** It models Conditional Access *concepts* in simplified form. It is not
> affiliated with or endorsed by Microsoft, does not connect to any tenant, and must not be used
> to predict the behaviour of a production policy set.

**Live site:** https://veena-ca-simulator.netlify.app/

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
index.html              policy editor, sign-in builder, result panel, status card
tests.html              engine tests and data-invariant checks
assets/js/engine.js     the evaluation engine — matching, requirements, verdicts
assets/js/fixtures.js   frozen test data: the spec's policies and its eight cases
assets/js/defaults.js   the app's editable starting policy set
assets/js/tests.js      test runner and data-invariant checks
assets/js/app.js        page wiring only — no evaluation logic
assets/css/             styles.css, tests.css (system font stack, no external fonts)
netlify.toml            security headers, deploy contexts, pretty URLs
docs/                   design spec and setup notes
```

Two rules hold the structure together:

1. **One engine, one definition.** There is no evaluation logic outside `engine.js`.
2. **Fixtures are test data.** `fixtures.js` is frozen and read only by the tests. The app's
   editable policy set comes from `defaults.js`, so editing policies in the browser cannot
   affect what the tests assert.

## Running locally

Serve the repository over http. Opening `index.html` from the filesystem will **not** work —
browsers refuse to load ES modules over `file://`, and the page comes up blank.

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

VS Code's Live Server extension works too, as long as the workspace root is the repository
folder — otherwise the absolute `/assets/...` paths 404.

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
- [x] Setup — GitHub repo, Netlify deployment, security headers, branch protection
- [x] Phase 2 — evaluation engine: four verdicts, with a per-policy explanation trace
- [x] Phase 3 — homepage wired to the real engine
- [x] Phase 4 — policy editor: list, enable/disable, delete, add, edit, reset
- [x] Phase 5 — sign-in builder and result panel, with live re-evaluation
- [ ] Phase 6 — persistence (export/import JSON), polish, write-up

## Licence

MIT — see `LICENSE`.
