// Engine test runner.
//
// Lives in its own file rather than an inline <script> block because the
// Content-Security-Policy in netlify.toml is script-src 'self' — inline
// scripts are refused. Local dev servers send no CSP, so an inline version
// works locally and silently fails once deployed.

// CASES as well as ALL_CASES: the freeze invariant below asserts on the §6
// fixtures specifically, and removing this import made it throw from inside a
// try/catch whose catch referenced the same missing binding — a check that
// cannot report a failure because it cannot run.
import { POLICIES, CASES, ALL_CASES } from './fixtures.js';
import { createDefaultPolicies, nextPolicyId } from './defaults.js';
import { evaluate } from './engine.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const rows = document.getElementById('rows');
const summary = document.getElementById('summary');
let passed = 0;

/** case id -> did it pass. Read by the summary below. */
const results = new Map();

for (const c of ALL_CASES) {
  const problems = [];
  let actual = '—';
  let trace = '';

  try {
    // Targeting cases bring their own policy set; spec §6 cases use the
    // four starter rules.
    const r = evaluate(c.signIn, c.policies ?? POLICIES);

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

    // Which policies applied. This was reported but not asserted while the
    // trace was being built in Phase 2; it has agreed with the spec on all
    // eight cases ever since, and for targeting it is the assertion that
    // matters — T10 and T11 differ only in which policy matched.
    if (Array.isArray(r?.matched)) {
      const got = r.matched.map((m) => m.id).sort().join(',');
      const want = [...c.expectedMatched].sort().join(',');
      trace = `matched [${got || '—'}]`;
      if (got !== want) problems.push(`matched [${got || '—'}], expected [${want || '—'}]`);
    } else {
      problems.push('no matched trace');
    }
  } catch (err) {
    problems.push(esc(err.message));
  }

  const ok = problems.length === 0;
  results.set(c.id, ok);
  if (ok) passed++;

  rows.insertAdjacentHTML('beforeend', `
    <tr class="${ok ? '' : 'fail'}">
      <td class="mono">${c.id}</td>
      <td>
        ${esc(c.description)}
        ${c.signIn.user ? `<div class="trace">as <strong>${esc(c.signIn.user)}</strong>${
          c.signIn.groups?.length ? ` — groups: ${esc(c.signIn.groups.join(', '))}` : ' — no groups'
        }</div>` : ''}
        <div class="trace">${esc(trace)}</div>
      </td>
      <td class="mono">${esc(c.expectedVerdict)}</td>
      <td class="mono">${esc(actual)}</td>
      <td>
        <span class="pill pill--${ok ? 'ok' : 'bad'}">${ok ? 'pass' : 'fail'}</span>
        ${ok ? '' : `<div class="why">${problems.join('<br>')}</div>`}
      </td>
    </tr>`);
}

const all = passed === ALL_CASES.length;

// A failing test page on a live site normally means something broke. Here it
// can also mean the spec is deliberately ahead of the engine: §9's targeting
// cases were written before any engine code, which is the whole point of
// writing them. Say which, so the page never looks like a regression when it
// is actually the method working.
const targeting = ALL_CASES.filter((c) => c.policies);   // §9 cases carry their own set
const core = ALL_CASES.filter((c) => !c.policies);      // §6 cases use the starter rules
const coreGreen = core.every((c) => results.get(c.id));
const targetingFailing = targeting.filter((c) => !results.get(c.id)).length;

// Every failure is a §9 case, and §6 is untouched: the spec is ahead of the
// engine on purpose, not broken.
const specAhead = !all && coreGreen;

summary.innerHTML =
  `<span class="pill pill--${all ? 'ok' : specAhead ? 'warn' : 'bad'}">` +
  `${passed} / ${ALL_CASES.length} passing</span>` +
  (all
    ? ' — engine matches the spec.'
    : specAhead
      ? ` — §6 is green (${core.length} / ${core.length}). ${targetingFailing} of the ` +
        `${targeting.length} targeting cases fail: spec §9 was written before the engine, ` +
        'and they stay red until it is built.'
      : ' — keep going.');

/* ------------------------------------------------------------------ *
 * Data invariants — properties of the data, not the engine
 * ------------------------------------------------------------------ */
const INVARIANTS = [
  {
    label: 'Test fixtures are deeply frozen (mutating a policy throws)',
    check() {
      try {
        POLICIES[0].name = 'mutated';
      } catch {
        return POLICIES[0].name !== 'mutated';
      }
      return false; // no throw means it was not frozen
    },
  },
  {
    label: 'Fixture sign-ins are frozen too',
    check() {
      try {
        CASES[0].signIn.deviceTrust = 'mutated';
      } catch {
        return CASES[0].signIn.deviceTrust !== 'mutated';
      }
      return false;
    },
  },
  {
    label: 'createDefaultPolicies() returns a new array each call',
    check: () => createDefaultPolicies() !== createDefaultPolicies(),
  },
  {
    label: 'createDefaultPolicies() returns new policy objects, not shared references',
    check: () => createDefaultPolicies()[0] !== createDefaultPolicies()[0],
  },
  {
    label: 'Editing a default set does not affect the next one',
    check() {
      const first = createDefaultPolicies();
      first[0].name = 'edited';
      return createDefaultPolicies()[0].name !== 'edited';
    },
  },
  {
    label: 'Defaults carry the four rules from spec §5',
    check: () => createDefaultPolicies().map((p) => p.id).join(',') === 'R1,R2,R3,R4',
  },
  {
    label: 'nextPolicyId() continues the sequence',
    check: () => nextPolicyId(createDefaultPolicies()) === 'R5',
  },
];

const invRows = document.getElementById('invariant-rows');
const invSummary = document.getElementById('invariant-summary');
let invPassed = 0;

for (const inv of INVARIANTS) {
  let ok = false;
  let note = '';
  try {
    ok = inv.check() === true;
  } catch (err) {
    note = esc(err.message);
  }
  if (ok) invPassed++;

  invRows.insertAdjacentHTML('beforeend', `
    <tr class="${ok ? '' : 'fail'}">
      <td>${esc(inv.label)}${note ? `<div class="why">${note}</div>` : ''}</td>
      <td><span class="pill pill--${ok ? 'ok' : 'bad'}">${ok ? 'pass' : 'fail'}</span></td>
    </tr>`);
}

const invAll = invPassed === INVARIANTS.length;
invSummary.innerHTML =
  `<span class="pill pill--${invAll ? 'ok' : 'bad'}">${invPassed} / ${INVARIANTS.length} passing</span>` +
  (invAll ? ' — test data is immutable and defaults are safely copyable.' : ' — see failures below.');
