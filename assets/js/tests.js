// Engine test runner.
//
// Lives in its own file rather than an inline <script> block because the
// Content-Security-Policy in netlify.toml is script-src 'self' — inline
// scripts are refused. Local dev servers send no CSP, so an inline version
// works locally and silently fails once deployed.

import { POLICIES, CASES } from './fixtures.js';
import { evaluate } from './engine.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const rows = document.getElementById('rows');
const summary = document.getElementById('summary');
let passed = 0;

for (const c of CASES) {
  const problems = [];
  let actual = '—';
  let trace = '';

  try {
    const r = evaluate(c.signIn, POLICIES);

    actual = r?.verdict ?? '(no verdict)';
    if (actual !== c.expectedVerdict) {
      problems.push(`verdict was "${actual}", expected "${c.expectedVerdict}"`);
    }

    // Outstanding requirements. Only meaningful when access wasn't denied —
    // once a block or an unsatisfiable requirement decides the verdict, spec §4
    // says anything still owed is moot, so we don't assert on it.
    const verdictIsDenial = actual === 'blocked' || actual === 'blockedUnsatisfiable';
    if (!verdictIsDenial && Array.isArray(r?.requirements) && c.expectedOutstanding) {
      const got = r.requirements.filter((q) => q.status === 'unresolved').map((q) => q.type).sort().join(',');
      const want = [...c.expectedOutstanding].sort().join(',');
      if (got !== want) problems.push(`outstanding [${got}], expected [${want}]`);
    }

    // Trace — reported, never failed. Built in the second pass.
    if (Array.isArray(r?.matched)) {
      const got = r.matched.map((m) => m.id).sort().join(',');
      const want = [...c.expectedMatched].sort().join(',');
      trace = got === want
        ? `matched [${got}] ✓`
        : `matched [${got}] — spec says [${want}] (not failing the test yet)`;
    } else {
      trace = 'no trace yet';
    }
  } catch (err) {
    problems.push(esc(err.message));
  }

  const ok = problems.length === 0;
  if (ok) passed++;

  rows.insertAdjacentHTML('beforeend', `
    <tr class="${ok ? '' : 'fail'}">
      <td class="mono">${c.id}</td>
      <td>${esc(c.description)}<div class="trace">${esc(trace)}</div></td>
      <td class="mono">${esc(c.expectedVerdict)}</td>
      <td class="mono">${esc(actual)}</td>
      <td>
        <span class="pill pill--${ok ? 'ok' : 'bad'}">${ok ? 'pass' : 'fail'}</span>
        ${ok ? '' : `<div class="why">${problems.join('<br>')}</div>`}
      </td>
    </tr>`);
}

const all = passed === CASES.length;
summary.innerHTML =
  `<span class="pill pill--${all ? 'ok' : 'bad'}">${passed} / ${CASES.length} passing</span>` +
  (all ? ' — engine matches the spec.' : ' — keep going.');
