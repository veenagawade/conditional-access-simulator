// Conditional Access Simulator — homepage bootstrap.
//
// The homepage stays a status page until the real UI arrives in Phases 4–5.
// What changed in Phase 3: it now runs the actual engine from engine.js against
// the real fixtures, so "the homepage self-test passes" and "the engine matches
// the spec" are the same claim rather than two unrelated ones.
//
// There is deliberately no evaluation logic in this file. One engine, one
// definition, in engine.js.

import { evaluate } from './engine.js';
import { POLICIES, CASES } from './fixtures.js';

/* ------------------------------------------------------------------ *
 * Engine self-test — the eight cases from docs/phase1-spec.md §6
 * ------------------------------------------------------------------ */
function runSelfTest() {
  const failures = [];

  for (const c of CASES) {
    let verdict;
    try {
      verdict = evaluate(c.signIn, POLICIES).verdict;
    } catch (err) {
      failures.push(`${c.id} threw: ${err.message}`);
      continue;
    }
    if (verdict !== c.expectedVerdict) {
      failures.push(`${c.id}: expected "${c.expectedVerdict}", got "${verdict}"`);
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

  const { passed, total, failures } = runSelfTest();
  const allPassed = failures.length === 0;
  setPill(
    'check-engine',
    `${passed} / ${total} passing`,
    allPassed ? 'ok' : 'bad',
  );
  if (!allPassed) setText('engine-failures', failures.join(' | '));
}

document.addEventListener('DOMContentLoaded', init);
