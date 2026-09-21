// Conditional Access Simulator — homepage bootstrap.
//
// The homepage stays a status page until the real UI arrives in Phases 4–5.
// What changed in Phase 3: it now runs the actual engine from engine.js against
// the real fixtures, so "the homepage self-test passes" and "the engine matches
// the spec" are the same claim rather than two unrelated ones.
//
// There is deliberately no evaluation logic in this file. One engine, one
// definition, in engine.js.

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
      <td class="muted">${p.conditions && Object.keys(p.conditions).length
        ? esc(describeConditions(p.conditions))
        : '<span class="condition-any">matches every sign-in</span>'}</td>
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

  renderPolicies();
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
  renderPolicies();
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
  renderPolicies();
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
  renderPolicies();
  form.elements.name.focus();
}

function init() {
  renderPolicies();
  document.getElementById('policy-rows')?.addEventListener('click', onPolicyAction);
  document.getElementById('policy-form')?.addEventListener('submit', onPolicyFormSubmit);
  document.getElementById('policy-form-cancel')?.addEventListener('click', cancelEdit);
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
