// Conditional Access Simulator — homepage wiring.
//
// The page has two editors and one answer: a policy set you can change, a
// sign-in you can describe, and a result panel explaining what the engine did
// with them. Every action re-renders both from state via render(), so the
// verdict on screen always belongs to the policy set on screen.
//
// There is deliberately no evaluation logic in this file. One engine, one
// definition, in engine.js. The self-test below runs that same engine against
// the eight spec cases, so "the homepage self-test passes" and "the engine
// matches the spec" are the same claim rather than two unrelated ones.

import { evaluate, describeConditions } from './engine.js';
import { createDefaultPolicies, nextPolicyId } from './defaults.js';
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

/* ------------------------------------------------------------------ *
 * Policy list
 * ------------------------------------------------------------------ */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let policies = createDefaultPolicies();
let editingId = null;
let resetArmed = false;
let resetTimer = null;

const EMPTY_ROW = `
  <tr>
    <td colspan="6" class="empty-state">
      No policies. With nothing to match, every sign-in is allowed.
    </td>
  </tr>`;

function policyRow(p) {
  return `
    <tr class="${p.enabled ? '' : 'is-disabled'} ${p.id === editingId ? 'is-editing' : ''}">
      <td class="mono">${esc(p.id)}</td>
      <td class="policy-name">${esc(p.name)}</td>
      <td class="muted ${p.conditions && Object.keys(p.conditions).length ? '' : 'condition-any'}">${esc(describeConditions(p.conditions))}</td>
      <td class="mono">${esc(p.requirement)}</td>
      <td><span class="pill pill--${p.enabled ? 'ok' : 'wait'}">${p.enabled ? 'enabled' : 'disabled'}</span></td>
      <td>
        <div class="row-actions">
          <button type="button" class="btn btn--sm" data-action="edit" data-id="${esc(p.id)}">Edit</button>
          <button type="button" class="btn btn--sm" data-action="toggle" data-id="${esc(p.id)}">${p.enabled ? 'Disable' : 'Enable'}</button>
          <button type="button" class="btn btn--sm btn--danger" data-action="delete" data-id="${esc(p.id)}">Delete</button>
        </div>
      </td>
    </tr>`;
}

function renderPolicies() {
  const tbody = document.getElementById('policy-rows');
  const count = document.getElementById('policy-count');
  if (!tbody) return;

  tbody.innerHTML = policies.length ? policies.map(policyRow).join('') : EMPTY_ROW;

  const enabled = policies.filter((p) => p.enabled).length;
  if (count) count.textContent = `${policies.length} policies, ${enabled} enabled.`;
}

function onPolicyAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  disarmReset();

  const id = button.dataset.id;
  const action = button.dataset.action;

  if (action === 'toggle') {
    const policy = policies.find((p) => p.id === id);
    if (policy) policy.enabled = !policy.enabled;
  }

  if (action === 'delete') {
    policies = policies.filter((p) => p.id !== id);
    if (id === editingId) {
      cancelEdit();
      return;
    }
  }

  if (action === 'edit') {
    startEdit(id);
    return;
  }

  render();
}

function setResetButton() {
  const button = document.getElementById('policy-reset');
  if (!button) return;
  button.classList.toggle('is-armed', resetArmed);
  button.textContent = resetArmed ? 'Confirm reset — discards your changes' : 'Reset to defaults';
}

function disarmReset() {
  if (!resetArmed) return;
  resetArmed = false;
  clearTimeout(resetTimer);
  setResetButton();
}

function onResetClick() {
  if (!resetArmed) {
    resetArmed = true;
    setResetButton();
    resetTimer = setTimeout(disarmReset, 5000);
    return;
  }

  disarmReset();
  policies = createDefaultPolicies();
  editingId = null;
  document.getElementById('policy-form')?.reset();
  setFormMode();
  render();
}

function setFormMode() {
  const form = document.getElementById('policy-form');
  const title = document.getElementById('policy-form-title');
  const submit = document.getElementById('policy-form-submit');
  const cancel = document.getElementById('policy-form-cancel');
  if (!form) return;

  const editing = editingId !== null;
  form.classList.toggle('is-editing', editing);
  if (title) title.textContent = editing ? `Edit ${editingId}` : 'Add a policy';
  if (submit) submit.textContent = editing ? 'Save changes' : 'Add policy';
  if (cancel) cancel.hidden = !editing;
}

function startEdit(id) {
  const policy = policies.find((p) => p.id === id);
  const form = document.getElementById('policy-form');
  if (!policy || !form) return;

  editingId = id;
  form.elements.name.value = policy.name;
  for (const key of CONDITION_KEYS) {
    form.elements[key].value = policy.conditions?.[key] ?? '';
  }
  form.elements.requirement.value = policy.requirement;

  setFormMode();
  render();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  form.elements.name.focus();
}

function cancelEdit() {
  const form = document.getElementById('policy-form');
  const error = document.getElementById('policy-form-error');
  editingId = null;
  form?.reset();
  if (error) error.textContent = '';
  setFormMode();
  render();
}

const CONDITION_KEYS = ['deviceType', 'deviceTrust', 'location', 'riskLevel', 'appSensitivity'];

function onPolicyFormSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);
  const error = document.getElementById('policy-form-error');

  const name = String(data.get('name') ?? '').trim();
  if (!name) {
    if (error) error.textContent = 'Give the policy a name — it is what the explanation will show.';
    form.querySelector('#f-name')?.focus();
    return;
  }

  const conditions = {};
  for (const key of CONDITION_KEYS) {
    const value = String(data.get(key) ?? '');
    if (value) conditions[key] = value;
  }

  const requirement = String(data.get('requirement') ?? 'mfa');

  if (editingId !== null) {
    policies = policies.map((p) =>
      p.id === editingId ? { ...p, name, conditions, requirement } : p);
    editingId = null;
  } else {
    policies = [
      ...policies,
      { id: nextPolicyId(policies), name, enabled: true, conditions, requirement },
    ];
  }

  if (error) error.textContent = '';
  form.reset();
  setFormMode();
  render();
  form.elements.name.focus();
}

/* ------------------------------------------------------------------ *
 * Sign-in builder
 * ------------------------------------------------------------------ */

// The same five attributes as CONDITION_KEYS, with display labels for the
// summary. The difference that matters: a policy's `conditions` may leave a key
// out, meaning "unconstrained". A sign-in never can — it always carries all
// five, because it describes something that actually happened.
const ATTRIBUTE_LABELS = {
  deviceType: 'Device type',
  deviceTrust: 'Device trust',
  location: 'Location',
  riskLevel: 'Risk level',
  appSensitivity: 'App sensitivity',
};

// The sign-in the page opens on: someone abroad on their own phone, reaching
// for something harmless.
//
// It is the blockedUnsatisfiable case, and it is the default because it is the
// one thing here a visitor should not have to go looking for. A requirement
// that cannot be met is a denial, not a prompt — the page says so before
// anyone clicks anything. The matching entry in SCENARIOS reuses this object,
// so the default and the scenario cannot drift apart.
const DEFAULT_SIGNIN = {
  deviceType: 'phone',
  deviceTrust: 'unmanaged',
  location: 'foreign',
  riskLevel: 'low',
  appSensitivity: 'low',
};

// Always a complete sign-in — there is no null state. The page evaluates on
// load, so every render has something real to explain.
//
// Note what is stored: the sign-in, not the result. The result panel recomputes
// from `signIn` and `policies` every time it renders, so editing a policy and
// re-rendering re-evaluates rather than redisplaying a verdict that is no
// longer true. Storing the result object here would be the bug.
let signIn = { ...DEFAULT_SIGNIN };

function signInSummary(s) {
  const chips = CONDITION_KEYS.map((key) => `
    <li>
      <span class="attr-label">${esc(ATTRIBUTE_LABELS[key])}</span>
      <span class="attr-value mono">${esc(s[key])}</span>
    </li>`).join('');

  return `<ul class="signin-summary">${chips}</ul>`;
}

// The four verdicts, in the words a colleague would use.
//
// `blocked` and `blockedUnsatisfiable` are both red, deliberately. Both are
// denials, and colouring one amber would suggest the user can clear it by
// answering a prompt — which is exactly the misreading the four-verdict model
// exists to prevent. The distinction lives in the sentence instead, because the
// user's next move differs completely: one is "you are not allowed to do this",
// the other is "you are not allowed to do this *from this device*".
//
// The raw verdict string is shown alongside the friendly label on purpose. It
// is the engine's actual contract, and the page may as well teach it.
const VERDICTS = {
  allowed: {
    label: 'Allowed',
    kind: 'ok',
    reading: 'No policy stands in the way, and every requirement in scope is already satisfied.',
  },
  challenge: {
    label: 'Challenge',
    kind: 'warn',
    reading: 'Access rests on a requirement the sign-in cannot answer by itself. The user gets prompted.',
  },
  blocked: {
    label: 'Blocked by policy',
    kind: 'bad',
    reading: 'A matching policy forbids this outright. No grant requirement overrides a block.',
  },
  blockedUnsatisfiable: {
    label: 'Blocked — a requirement cannot be met',
    kind: 'bad',
    reading: 'A requirement the sign-in can answer came back unmet. The same user, on a compliant device, would be let in.',
  },
};

function verdictBadge(verdict) {
  const v = VERDICTS[verdict];

  // An unrecognised verdict means the engine and this file have drifted apart.
  // Say so loudly rather than rendering an empty box that looks like a pass.
  if (!v) {
    return `<p class="verdict-unknown">Unrecognised verdict: <code>${esc(verdict)}</code></p>`;
  }

  return `
    <div class="verdict verdict--${v.kind}">
      <span class="verdict-label">${esc(v.label)}</span>
      <code class="verdict-code">${esc(verdict)}</code>
    </div>
    <p class="verdict-reading">${esc(v.reading)}</p>`;
}

// Requirement status → the pill colours already used across the page.
const REQUIREMENT_STATUS = {
  satisfied:  { label: 'satisfied',  kind: 'ok' },
  failed:     { label: 'failed',     kind: 'bad' },
  unresolved: { label: 'unresolved', kind: 'warn' },
};

function requirementRow(r) {
  const status = REQUIREMENT_STATUS[r.status] ?? { label: r.status, kind: 'wait' };
  return `
    <tr>
      <td class="mono">${esc(r.type)}</td>
      <td><span class="pill pill--${status.kind}">${esc(status.label)}</span></td>
      <td class="muted">${esc(r.because)}</td>
    </tr>`;
}

function requirementsSection(result) {
  const heading = '<h3 class="result-subhead">Requirements</h3>';

  if (result.requirements.length) {
    return `
      ${heading}
      <div class="tablewrap">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Requirement</th>
              <th scope="col">Status</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>${result.requirements.map(requirementRow).join('')}</tbody>
        </table>
      </div>`;
  }

  // An empty list means one of two entirely different things, and saying which
  // is the whole point of this section:
  //
  //   'blocked'  — the engine returned at step 2 of the decision order.
  //                Requirements were never collected, because no grant control
  //                overrides a block.
  //   otherwise  — nothing matched. Every matched non-block policy contributes
  //                a requirement type, so an empty list on any other verdict
  //                means the matched set was empty.
  //
  // Rendering blank for both would collapse the distinction this project exists
  // to explain.
  const note = result.verdict === 'blocked'
    ? 'Not evaluated — a block ends the decision before grant requirements are considered.'
    : 'No requirements — no policy matched this sign-in.';

  return `${heading}<p class="result-note muted">${esc(note)}</p>`;
}

function policyTraceSection(title, entries, emptyNote) {
  const heading = `<h3 class="result-subhead">${esc(title)}</h3>`;

  if (!entries.length) {
    return `${heading}<p class="result-note muted">${esc(emptyNote)}</p>`;
  }

  const rows = entries.map((e) => `
    <tr>
      <td class="mono">${esc(e.id)}</td>
      <td class="policy-name">${esc(e.name)}</td>
      <td class="muted">${esc(e.why)}</td>
    </tr>`).join('');

  return `
    ${heading}
    <div class="tablewrap">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Policy</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// The last HTML written to the result panel.
//
// #result-panel is an aria-live region, so every write is announced to a
// screen reader. Now that a policy edit re-renders the result, actions that
// change nothing about the outcome — renaming a policy, say — would otherwise
// read the whole result aloud again. Comparing against panel.innerHTML would
// not work: browsers normalise it, so the strings would never match and the
// guard would silently never fire.
let lastResultHtml = null;

function renderResult() {
  const panel = document.getElementById('result-panel');
  if (!panel) return;

  const html = resultHtml();
  if (html === lastResultHtml) return;

  lastResultHtml = html;
  panel.innerHTML = html;
}

function resultHtml() {
  // Computed here, every render, from `signIn` and the live `policies` array.
  // Nothing about this result is stored — which is what lets a policy edit
  // re-run the evaluation without any extra machinery.
  const result = evaluate(signIn, policies);

  // The sign-in stays above the verdict so it is never ambiguous which sign-in
  // the verdict belongs to.
  return `
    ${signInSummary(signIn)}
    ${verdictBadge(result.verdict)}
    ${requirementsSection(result)}
    ${policyTraceSection(
      'Policies that matched',
      result.matched,
      'No policy matched this sign-in. With nothing in scope, there is nothing to enforce.',
    )}
    ${policyTraceSection(
      'Policies that did not match',
      result.unmatched,
      // Empty for two different reasons again, so it says which.
      result.matched.length
        ? 'Every policy matched this sign-in.'
        : 'There are no policies to evaluate.',
    )}`;
}

function onSignInSubmit(event) {
  event.preventDefault();

  const data = new FormData(event.currentTarget);
  signIn = Object.fromEntries(
    CONDITION_KEYS.map((key) => [key, String(data.get(key) ?? '')]),
  );

  render();
}

function onSignInReset() {
  const form = document.getElementById('signin-form');
  if (!form) return;

  for (const key of CONDITION_KEYS) form.elements[key].value = DEFAULT_SIGNIN[key];
  signIn = { ...DEFAULT_SIGNIN };
  render();
}

/* ------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------ */

// One click loads a sign-in and evaluates it, so the interesting verdicts are
// reachable without knowing which five dropdowns to set. Chosen to cover all
// four verdicts plus the stacking case.
//
// Scenarios describe SIGN-INS ONLY. None of them touches the policy set — a
// button that silently rewrote your policies would be the worst kind of
// surprise, and it would also make the verdicts here impossible to trust as a
// demonstration of the policies actually on screen.
const SCENARIOS = [
  {
    id: 'everyday',
    label: 'Everyday sign-in',
    note: 'Nothing matches. Access is simply allowed.',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted', riskLevel: 'low', appSensitivity: 'low' },
  },
  {
    id: 'sensitive-office',
    label: 'Sensitive app from the office',
    note: 'One policy applies, and it asks for MFA.',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted', riskLevel: 'low', appSensitivity: 'high' },
  },
  {
    id: 'personal-phone-finance',
    label: 'Personal phone, finance app',
    note: 'Two policies apply. The block wins outright.',
    signIn: { deviceType: 'phone', deviceTrust: 'unmanaged', location: 'trusted', riskLevel: 'low', appSensitivity: 'high' },
  },
  {
    id: 'travelling-personal-device',
    label: 'Travelling on a personal device',
    note: 'A requirement that cannot be met. This is a denial, not a prompt.',
    // The page opens on this one. Reusing DEFAULT_SIGNIN rather than repeating
    // its five values keeps the landing state and this button in step.
    signIn: DEFAULT_SIGNIN,
  },
  {
    id: 'risky-abroad',
    label: 'High-risk sign-in abroad',
    note: 'Three policies stack. The managed device already satisfies one of them.',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'foreign', riskLevel: 'high', appSensitivity: 'high' },
  },
];

/** The five dropdowns as they stand right now — the sign-in being composed. */
function formSignIn() {
  const form = document.getElementById('signin-form');
  if (!form) return null;
  return Object.fromEntries(
    CONDITION_KEYS.map((key) => [key, form.elements[key].value]),
  );
}

/**
 * Which scenario, if any, the FORM currently describes.
 *
 * The form and `signIn` are two different things: the form is the sign-in
 * being composed, `signIn` the one that was submitted. The scenario buttons
 * load the form, so the highlight belongs to the form — click a scenario and
 * it lights up immediately, before anything is evaluated.
 *
 * Derived, not stored. Storing the clicked id would go stale the moment
 * someone edits a dropdown, and the highlight would claim a scenario the form
 * no longer describes. Deriving it also means setting the five dropdowns by
 * hand to match a scenario lights that scenario up, because at that point the
 * form genuinely is that scenario.
 */
function activeScenarioId() {
  const current = formSignIn();
  if (!current) return null;
  const match = SCENARIOS.find((s) =>
    CONDITION_KEYS.every((key) => s.signIn[key] === current[key]));
  return match ? match.id : null;
}

/**
 * Whether the form has moved on from the sign-in the result describes.
 *
 * This is what gives the Evaluate button something to do. Without it, loading
 * a scenario and seeing the old result sitting there reads as a bug rather
 * than as "you have not pressed the button yet".
 */
function renderSignInPending() {
  const el = document.getElementById('signin-pending');
  if (!el) return;

  const current = formSignIn();
  const pending = current && CONDITION_KEYS.some((key) => current[key] !== signIn[key]);

  el.textContent = pending ? 'Not evaluated yet — press Evaluate to see this sign-in.' : '';
  el.hidden = !pending;
}

function renderScenarios() {
  const host = document.getElementById('scenario-buttons');
  if (!host) return;

  const activeId = activeScenarioId();

  host.innerHTML = SCENARIOS.map((s) => {
    const active = s.id === activeId;
    return `
    <button type="button" class="scenario ${active ? 'is-active' : ''}"
            data-scenario="${esc(s.id)}" aria-pressed="${active}">
      <span class="scenario-label">${esc(s.label)}</span>
      <span class="scenario-note">${esc(s.note)}</span>
    </button>`;
  }).join('');
}

function onScenarioClick(event) {
  const button = event.target.closest('button[data-scenario]');
  if (!button) return;

  const scenario = SCENARIOS.find((s) => s.id === button.dataset.scenario);
  if (!scenario) return;

  const form = document.getElementById('signin-form');
  if (!form) return;

  // Loads the form and stops. `signIn` is not touched, so the result panel
  // keeps describing the sign-in it was given until Evaluate is pressed.
  // Auto-evaluating here would leave the Evaluate button with nothing to do
  // except serve hand-edits, which is two interaction models in one form.
  for (const key of CONDITION_KEYS) form.elements[key].value = scenario.signIn[key];

  render();
}

// Every action re-renders everything from state.
//
// The policy list and the result panel are two views of the same two
// variables, `policies` and `signIn`. Rendering them together is what makes a
// stale verdict structurally impossible rather than merely unlikely — there is
// no path that updates one without the other, and no cached result to forget
// to invalidate.
function render() {
  renderPolicies();
  renderResult();
  renderScenarios();
  renderSignInPending();
}

function init() {
  render();
  setResetButton();
  document.getElementById('policy-rows')?.addEventListener('click', onPolicyAction);
  document.getElementById('policy-form')?.addEventListener('submit', onPolicyFormSubmit);
  document.getElementById('policy-form-cancel')?.addEventListener('click', cancelEdit);
  document.getElementById('policy-reset')?.addEventListener('click', onResetClick);
  document.getElementById('signin-form')?.addEventListener('submit', onSignInSubmit);
  document.getElementById('signin-reset')?.addEventListener('click', onSignInReset);
  document.getElementById('scenario-buttons')?.addEventListener('click', onScenarioClick);
  // The highlight and the pending hint both describe the form, so they have to
  // react to the form, not only to Evaluate.
  document.getElementById('signin-form')?.addEventListener('change', render);
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
