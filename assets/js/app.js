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

import { evaluate, describeConditions, ATTRIBUTES, ATTRIBUTE_KEYS } from './engine.js';
import { createDefaultPolicies, nextPolicyId, PRINCIPALS, DEFAULT_PRINCIPAL_ID } from './defaults.js';
import { POLICIES, ALL_CASES } from './fixtures.js';

/* ------------------------------------------------------------------ *
 * Engine self-test — the eight cases from docs/phase1-spec.md §6
 * ------------------------------------------------------------------ */
function runSelfTest() {
  const failures = [];

  for (const c of ALL_CASES) {
    let verdict;
    try {
      // Targeting cases carry their own policy set; §6 cases use the starter rules.
      verdict = evaluate(c.signIn, c.policies ?? POLICIES).verdict;
    } catch (err) {
      failures.push(`${c.id} threw: ${err.message}`);
      continue;
    }
    if (verdict !== c.expectedVerdict) {
      failures.push(`${c.id}: expected "${c.expectedVerdict}", got "${verdict}"`);
    }
  }

  return { passed: ALL_CASES.length - failures.length, total: ALL_CASES.length, failures };
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

/**
 * One icon from the sprite in index.html.
 *
 * Every icon is decorative — the text beside it already says what it says —
 * so they are aria-hidden and nothing here is understandable only by seeing
 * one. Strokes are currentColor, so an icon inside a red verdict is red
 * without a second definition.
 */
const ico = (name) => `<svg class="ico" aria-hidden="true"><use href="#ico-${name}"></use></svg>`;

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

/* ------------------------------------------------------------------ *
 * Policy exclusions — spec §9
 *
 * The editor exposes `excludes` and nothing else: every policy authored here
 * applies to everyone, minus whoever is ticked. The engine also supports
 * targeting a group (`appliesTo`), and /tests proves it, but the editor does
 * not offer it — exclusion is the half that changes outcomes, and it is the
 * shape of a real incident-response policy.
 * ------------------------------------------------------------------ */

function renderExcludeChecks() {
  const host = document.getElementById('f-excludes');
  if (!host || host.children.length) return;           // built once
  host.innerHTML = PRINCIPALS.map((p) => `
    <label class="check">
      <input type="checkbox" name="excludes" value="${esc(p.id)}" />
      <span>${esc(p.name)}</span>
    </label>`).join('');
}

/** Ticked boxes -> the engine's shape. Omitted entirely when nobody is ticked. */
function readExcludes(form) {
  const ids = [...form.querySelectorAll('input[name="excludes"]:checked')].map((b) => b.value);
  return ids.length ? { users: ids } : undefined;
}

function setExcludeChecks(policy) {
  const ids = policy?.excludes?.users ?? [];
  for (const box of document.querySelectorAll('input[name="excludes"]')) {
    box.checked = ids.includes(box.value);
  }
}

/** "Everyone except Emergency access 01", or nothing at all. */
function describeExcludes(policy) {
  const ids = policy.excludes?.users ?? [];
  if (!ids.length) return '';
  const names = ids.map((id) => principalById(id).name).join(', ');
  return `<div class="row-excludes">${ico('shield')}Everyone except ${esc(names)}</div>`;
}

function policyRow(p) {
  return `
    <tr class="${p.enabled ? '' : 'is-disabled'} ${p.id === editingId ? 'is-editing' : ''}">
      <td class="mono">${esc(p.id)}</td>
      <td class="policy-name">${esc(p.name)}${describeExcludes(p)}</td>
      <td class="muted ${p.conditions && Object.keys(p.conditions).length ? '' : 'condition-any'}">${
        p.conditions && Object.keys(p.conditions).length ? '' : ico('warn')
      }${esc(describeConditions(p.conditions))}</td>
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
  setExportNote('');

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

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

/**
 * The exported shape. A wrapper rather than a bare array of policies.
 *
 * `format` lets import say "this is not a policy set" instead of failing on a
 * missing field twenty lines in. `version` means a future change to the policy
 * shape can be detected rather than silently misread. A file that outlives the
 * code that wrote it has to say what it is.
 *
 * Principals are not exported. The directory is read-only app data, not
 * something the user edited, and exporting it would imply importing it.
 */
export const POLICY_SET_FORMAT = 'conditional-access-simulator/policy-set';
export const POLICY_SET_VERSION = 1;

function policySetJson() {
  return JSON.stringify({
    format: POLICY_SET_FORMAT,
    version: POLICY_SET_VERSION,
    exported: new Date().toISOString(),
    policies,
  }, null, 2);
}

function exportFilename() {
  const day = new Date().toISOString().slice(0, 10);
  return `ca-policies-${day}.json`;
}

function setExportNote(message, kind) {
  const note = document.getElementById('export-note');
  if (!note) return;
  note.textContent = message;
  note.hidden = !message;
  note.classList.toggle('is-notable', kind === 'bad');
}

/**
 * Downloading a generated file under `default-src 'self'`.
 *
 * A blob: URL on a temporary <a download> is the usual approach, and whether
 * it survives this CSP is the whole risk in this change — local dev sends no
 * CSP headers, so a version that fails in production passes locally. Hence the
 * try/catch and the visible note: a refused download and a download that
 * simply did not happen look identical from the outside, and a silent failure
 * here would be indistinguishable from a broken button.
 */
function onExportClick() {
  let url;
  try {
    const blob = new Blob([policySetJson()], { type: 'application/json' });
    url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();

    setExportNote(`Downloaded ${exportFilename()} — ${policies.length} policies.`, 'ok');
  } catch (err) {
    setExportNote(`Could not export: ${err.message}. Check the browser console.`, 'bad');
    // Re-thrown so it reaches the console rather than being swallowed by a
    // message that only says something went wrong.
    throw err;
  } finally {
    // Released on the next tick — revoking synchronously can cancel the
    // download in some browsers before it has read the blob.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
  }
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
  // The button contains an icon as well as text, so the label lives in its own
  // span. Setting textContent on the button itself would delete the icon.
  const submitText = document.getElementById('policy-form-submit-text');
  if (submitText) submitText.textContent = editing ? 'Save changes' : 'Add policy';
  if (cancel) cancel.hidden = !editing;
}

function startEdit(id) {
  const policy = policies.find((p) => p.id === id);
  const form = document.getElementById('policy-form');
  if (!policy || !form) return;

  editingId = id;
  form.elements.name.value = policy.name;
  for (const key of ATTRIBUTE_KEYS) {
    form.elements[key].value = policy.conditions?.[key] ?? '';
  }
  form.elements.requirement.value = policy.requirement;
  setExcludeChecks(policy);

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

/**
 * Fills both attribute forms from the one definition in engine.js — labels and
 * options alike.
 *
 * `includeAny` is the one real difference between them and the reason this
 * takes a flag rather than being two near-identical functions that drift: a
 * policy condition may be unconstrained, a sign-in may not. A sign-in always
 * carries all five.
 */
function renderAttributeFields(prefix, { includeAny }) {
  for (const attr of ATTRIBUTES) {
    const id = `${prefix}-${attr.key}`;
    const select = document.getElementById(id);
    if (!select) continue;

    const label = document.querySelector(`label[for="${id}"]`);
    if (label) label.textContent = attr.label;

    if (select.options.length) continue;            // built once
    select.innerHTML =
      (includeAny ? '<option value="">Any</option>' : '') +
      attr.values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }
}

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
  for (const key of ATTRIBUTE_KEYS) {
    const value = String(data.get(key) ?? '');
    if (value) conditions[key] = value;
  }

  const requirement = String(data.get('requirement') ?? 'mfa');

  const excludes = readExcludes(form);

  if (editingId !== null) {
    policies = policies.map((p) => {
      if (p.id !== editingId) return p;
      // Rebuilt rather than spread-over, so unticking every box actually
      // removes the key instead of leaving a stale one behind.
      const { excludes: _drop, ...rest } = p;
      return { ...rest, name, conditions, requirement, ...(excludes ? { excludes } : {}) };
    });
    editingId = null;
  } else {
    policies = [
      ...policies,
      {
        id: nextPolicyId(policies),
        name, enabled: true, conditions, requirement,
        ...(excludes ? { excludes } : {}),
      },
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

// The same five attributes as ATTRIBUTE_KEYS, with display labels for the
// summary. The difference that matters: a policy's `conditions` may leave a key
// out, meaning "unconstrained". A sign-in never can — it always carries all
// five, because it describes something that actually happened.
/** An unremarkable sign-in — nothing about it should attract a policy. */
const BENIGN_SIGNIN = {
  deviceType: 'laptop',
  deviceTrust: 'managed',
  location: 'trusted',
  riskLevel: 'low',
  appSensitivity: 'low',
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
/* ------------------------------------------------------------------ *
 * The principal — spec §9.1
 * ------------------------------------------------------------------ */

const principalById = (id) => PRINCIPALS.find((p) => p.id === id) ?? PRINCIPALS[0];

/** The principal as the engine wants it: a user id and a flat group list. */
const asPrincipal = (id) => {
  const p = principalById(id);
  return { user: p.id, groups: [...p.groups] };
};

function renderPrincipalOptions() {
  const select = document.getElementById('s-user');
  if (!select || select.options.length) return;   // built once
  select.innerHTML = PRINCIPALS.map((p) =>
    `<option value="${esc(p.id)}" ${p.id === DEFAULT_PRINCIPAL_ID ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');
}

/**
 * Groups are SHOWN, not chosen.
 *
 * You pick a person and their groups come with them. Letting anyone tick
 * arbitrary groups would model a directory editor, which this is not, and it
 * would make it trivial to build a principal who does not exist — then reason
 * about a verdict for them.
 */
function renderPrincipalGroups() {
  const note = document.getElementById('s-user-groups');
  const select = document.getElementById('s-user');
  if (!note || !select) return;

  const p = principalById(select.value);
  note.innerHTML = p.groups.length
    ? `Groups: <span class="mono">${esc(p.groups.join(', '))}</span>`
    : `${ico('warn')}In no groups at all — a group-targeted policy cannot reach this account.`;
  note.classList.toggle('is-notable', p.groups.length === 0);
}

// The five attributes plus who is signing in. DEFAULT_SIGNIN stays
// attributes-only because the scenarios reuse it, and a scenario describes a
// situation rather than a person.
let signIn = { ...asPrincipal(DEFAULT_PRINCIPAL_ID), ...DEFAULT_SIGNIN };

// Parameter is `s`, not `signIn`: the module-level `signIn` is the live state,
// and shadowing it here would make a stale-render bug very easy to write.
function signInSummary(s) {
  const p = principalById(s.user);
  const principal = `
    <li class="is-principal">
      <span class="attr-label">Signing in as</span>
      <span class="attr-value">${esc(p.name)}</span>
    </li>
    <li class="is-principal">
      <span class="attr-label">Groups</span>
      <span class="attr-value mono">${s.groups?.length ? esc(s.groups.join(', ')) : 'none'}</span>
    </li>`;

  const chips = ATTRIBUTES.map(({ key, label }) => `
    <li>
      <span class="attr-label">${esc(label)}</span>
      <span class="attr-value mono">${esc(s[key])}</span>
    </li>`).join('');

  return `<ul class="signin-summary">${principal}${chips}</ul>`;
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
    icon: 'check',
    label: 'Allowed',
    kind: 'ok',
    reading: 'No policy stands in the way, and every requirement in scope is already satisfied.',
  },
  challenge: {
    icon: 'question',
    label: 'Challenge',
    kind: 'warn',
    reading: 'Access rests on a requirement the sign-in cannot answer by itself. The user gets prompted.',
  },
  blocked: {
    icon: 'ban',
    label: 'Blocked by policy',
    kind: 'bad',
    reading: 'A matching policy forbids this outright. No grant requirement overrides a block.',
  },
  blockedUnsatisfiable: {
    icon: 'warn',
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
      ${ico(v.icon)}
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

  signIn = formSignIn();
  render();
}

function onSignInReset() {
  const form = document.getElementById('signin-form');
  if (!form) return;

  for (const key of ATTRIBUTE_KEYS) form.elements[key].value = DEFAULT_SIGNIN[key];
  form.elements.user.value = DEFAULT_PRINCIPAL_ID;
  signIn = { ...asPrincipal(DEFAULT_PRINCIPAL_ID), ...DEFAULT_SIGNIN };
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
    icon: 'laptop',
    label: 'Everyday sign-in',
    note: 'Nothing matches. Access is simply allowed.',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted', riskLevel: 'low', appSensitivity: 'low' },
  },
  {
    id: 'sensitive-office',
    icon: 'shield',
    label: 'Sensitive app from the office',
    note: 'One policy applies, and it asks for MFA.',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted', riskLevel: 'low', appSensitivity: 'high' },
  },
  {
    id: 'personal-phone-finance',
    icon: 'card',
    label: 'Personal phone, finance app',
    note: 'Two policies apply. The block wins outright.',
    signIn: { deviceType: 'phone', deviceTrust: 'unmanaged', location: 'trusted', riskLevel: 'low', appSensitivity: 'high' },
  },
  {
    id: 'travelling-personal-device',
    icon: 'plane',
    label: 'Travelling on a personal device',
    note: 'A requirement that cannot be met. This is a denial, not a prompt.',
    // The page opens on this one. Reusing DEFAULT_SIGNIN rather than repeating
    // its five values keeps the landing state and this button in step.
    signIn: DEFAULT_SIGNIN,
  },
  {
    id: 'risky-abroad',
    icon: 'globe',
    label: 'High-risk sign-in abroad',
    note: 'Three policies stack. The managed device already satisfies one of them.',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'foreign', riskLevel: 'high', appSensitivity: 'high' },
  },
];

/** The five dropdowns as they stand right now — the sign-in being composed. */
function formSignIn() {
  const form = document.getElementById('signin-form');
  if (!form) return null;
  return {
    ...asPrincipal(form.elements.user.value),
    ...Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, form.elements[key].value])),
  };
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

  // Compared on the five attributes only. A scenario describes a situation —
  // "travelling on a personal device" — not a person, so changing who is
  // signing in must not clear the highlight.
  const match = SCENARIOS.find((s) =>
    ATTRIBUTE_KEYS.every((key) => s.signIn[key] === current[key]));
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
  // `user` as well as the five attributes: the person IS part of the sign-in,
  // so switching from Alice to Sam makes the result on screen stale.
  const pending = current && ['user', ...ATTRIBUTE_KEYS].some((key) => current[key] !== signIn[key]);

  // innerHTML rather than textContent because of the icon. The string is a
  // constant in this file; no user input reaches it.
  el.innerHTML = pending
    ? `${ico('warn')}Not evaluated yet — press Evaluate to see this sign-in.`
    : '';
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
      <span class="scenario-ico">${ico(s.icon)}</span>
      <span class="scenario-text">
        <span class="scenario-label">${esc(s.label)}</span>
        <span class="scenario-note">${esc(s.note)}</span>
      </span>
    </button>`;
  }).join('');
}

/**
 * The break-glass set piece — spec §9.
 *
 * The five scenarios above describe SIGN-INS and never touch the policy set.
 * This one has to, because its whole point is a tenant-wide block that does not
 * exist in the defaults. So it is separated in the markup, labelled as loading
 * a policy set, and says what it will replace before it is clicked.
 *
 * It loads the form — the policy set and who is signing in — and stops there,
 * exactly like the five above. Press Evaluate to see the verdict.
 *
 * The policy table and the result panel both update immediately anyway,
 * because render() recomputes from the live `policies` array: the block bites
 * the sign-in already on screen and the panel flips to `blocked`. Then
 * Evaluate, as the excluded account, flips it to `allowed`. Seeing the block
 * land before seeing it not land is the better demonstration, and it keeps one
 * interaction model with no exception to explain.
 */
function loadLockoutScenario() {
  const form = document.getElementById('signin-form');
  if (!form) return;

  policies = [{
    id: 'R1',
    name: 'Block everything during the incident',
    enabled: true,
    conditions: {},
    excludes: { users: ['bg-01'] },
    requirement: 'block',
  }];
  editingId = null;

  form.elements.user.value = 'bg-01';
  for (const key of ATTRIBUTE_KEYS) form.elements[key].value = BENIGN_SIGNIN[key];

  // `signIn` is deliberately untouched. Replacing the policies re-evaluates the
  // sign-in already on screen, which is live and correct rather than stale —
  // and the pending hint says the form has moved on.
  setFormMode();
  render();
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
  for (const key of ATTRIBUTE_KEYS) form.elements[key].value = scenario.signIn[key];

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
  renderPrincipalGroups();
}

function init() {
  renderPrincipalOptions();
  renderExcludeChecks();

  // Both attribute forms are built from the one definition in engine.js. The
  // policy form allows "Any" because a condition may be unconstrained; the
  // sign-in form does not, because a sign-in always carries all five.
  renderAttributeFields('f', { includeAny: true });
  renderAttributeFields('s', { includeAny: false });

  // The sign-in form's defaults were `selected` attributes in the markup until
  // the options started being rendered. They are set here instead.
  const signinForm = document.getElementById('signin-form');
  if (signinForm) {
    for (const key of ATTRIBUTE_KEYS) signinForm.elements[key].value = DEFAULT_SIGNIN[key];
  }

  render();
  setResetButton();
  document.getElementById('policy-rows')?.addEventListener('click', onPolicyAction);
  document.getElementById('policy-form')?.addEventListener('submit', onPolicyFormSubmit);
  document.getElementById('policy-form-cancel')?.addEventListener('click', cancelEdit);
  document.getElementById('policy-reset')?.addEventListener('click', onResetClick);
  document.getElementById('policy-export')?.addEventListener('click', onExportClick);
  document.getElementById('signin-form')?.addEventListener('submit', onSignInSubmit);
  document.getElementById('signin-reset')?.addEventListener('click', onSignInReset);
  document.getElementById('scenario-buttons')?.addEventListener('click', onScenarioClick);
  document.getElementById('load-lockout')?.addEventListener('click', loadLockoutScenario);
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
