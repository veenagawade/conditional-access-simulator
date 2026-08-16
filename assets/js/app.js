// Conditional Access Simulator — bootstrap / pipeline smoke test
//
// This file exists so the very first deploy proves that:
//   1. an ES module actually loads and runs on Netlify,
//   2. the Content-Security-Policy in netlify.toml is not blocking your own assets,
//   3. the site is served over HTTPS.
//
// Phase 2 replaces the placeholder engine below with the real one from phase1-spec.md.

/* ------------------------------------------------------------------ *
 * Placeholder engine — DELETE IN PHASE 2
 * Encodes only the shape of the decision rule so the smoke test has
 * something real to assert against: a block beats everything; otherwise
 * the grant requirements of all matching policies stack.
 * ------------------------------------------------------------------ */
export function evaluate(signIn, policies) {
  const matched = policies.filter((p) => p.enabled && p.matches(signIn));

  const blocked = matched.find((p) => p.effect === 'block');
  if (blocked) {
    return { decision: 'blocked', requirements: [], reasons: [blocked.name] };
  }

  const requirements = [...new Set(matched.flatMap((p) => p.requirements ?? []))];
  return {
    decision: requirements.length ? 'granted-with-requirements' : 'granted',
    requirements,
    reasons: matched.map((p) => p.name),
  };
}

/* ------------------------------------------------------------------ *
 * Smoke test
 * ------------------------------------------------------------------ */
const SAMPLE_POLICIES = [
  {
    name: 'Block legacy authentication',
    enabled: true,
    effect: 'block',
    matches: (s) => s.clientApp === 'legacy',
  },
  {
    name: 'Require MFA for high-sensitivity apps',
    enabled: true,
    effect: 'grant',
    requirements: ['mfa'],
    matches: (s) => s.appSensitivity === 'high',
  },
  {
    name: 'Require compliant device off corporate network',
    enabled: true,
    effect: 'grant',
    requirements: ['compliantDevice'],
    matches: (s) => s.location !== 'trusted',
  },
];

const CASES = [
  {
    label: 'legacy auth is blocked outright',
    signIn: { clientApp: 'legacy', appSensitivity: 'high', location: 'untrusted' },
    expect: 'blocked',
  },
  {
    label: 'high-sensitivity app off-network stacks two requirements',
    signIn: { clientApp: 'modern', appSensitivity: 'high', location: 'untrusted' },
    expect: 'granted-with-requirements',
    expectRequirements: ['mfa', 'compliantDevice'],
  },
  {
    label: 'low-sensitivity app on trusted network passes clean',
    signIn: { clientApp: 'modern', appSensitivity: 'low', location: 'trusted' },
    expect: 'granted',
  },
];

function runSmokeTest() {
  const failures = [];

  for (const c of CASES) {
    const result = evaluate(c.signIn, SAMPLE_POLICIES);
    if (result.decision !== c.expect) {
      failures.push(`${c.label}: expected "${c.expect}", got "${result.decision}"`);
      continue;
    }
    if (c.expectRequirements) {
      const got = [...result.requirements].sort().join(',');
      const want = [...c.expectRequirements].sort().join(',');
      if (got !== want) {
        failures.push(`${c.label}: expected requirements [${want}], got [${got}]`);
      }
    }
  }

  return { passed: CASES.length - failures.length, total: CASES.length, failures };
}

/* ------------------------------------------------------------------ *
 * Page wiring
 * ------------------------------------------------------------------ */
function setPill(id, text, kind) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<span class="pill pill--${kind}">${text}</span>`;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function init() {
  setPill('check-js', 'yes', 'ok');

  // If the stylesheet were blocked by CSP the custom property would be missing.
  const styled = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent')
    .trim();
  setPill('check-css', styled ? 'yes' : 'no — check CSP', styled ? 'ok' : 'bad');

  const secure = location.protocol === 'https:';
  const localhost = ['localhost', '127.0.0.1'].includes(location.hostname);
  setPill(
    'check-https',
    secure ? 'yes' : localhost ? 'n/a — local preview' : 'no',
    secure ? 'ok' : localhost ? 'warn' : 'bad',
  );

  setText('check-host', location.host || 'file://');
  setText('check-time', new Date().toISOString());

  const btn = document.getElementById('smoke-test');
  const out = document.getElementById('smoke-result');
  btn?.addEventListener('click', () => {
    const { passed, total, failures } = runSmokeTest();
    out.textContent = failures.length
      ? `${passed}/${total} passed — ${failures.join(' | ')}`
      : `${passed}/${total} passed. Decision logic wired correctly.`;
  });
}

document.addEventListener('DOMContentLoaded', init);
