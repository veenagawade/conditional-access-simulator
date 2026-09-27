// TEST DATA. Read by tests — never used as the app's editable policy state.
//
// Tests may import this freely, including the homepage self-test in app.js: that
// is a test, and it should run against the spec's fixed policy set. What must
// never happen is the policy editor loading POLICIES and letting a user edit it.
// The editor's data comes from defaults.js.
//
// The four starter policies from docs/phase1-spec.md §5, and the eight test
// cases from §6. This file is the definition of "correct". Do not edit it to
// make your engine pass — change the engine, or change the spec first and then
// this file.
//
// The app's editable starting policies live in defaults.js. The two files hold
// the same four rules today, and that duplication is deliberate: if the tests
// imported the app's data, changing a default policy would silently change what
// the tests assert, and a broken policy set would still "pass". Test data has to
// be independent of the thing it is testing.
//
// Everything exported here is deeply frozen. Modules run in strict mode, so any
// attempt to mutate a fixture throws instead of failing silently.

/** Recursively freeze an object and everything it contains. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/**
 * @typedef {object} SignIn
 * @property {string}   [user]    Principal id. Absent means "no principal" — such a
 *                                sign-in can only match untargeted policies (spec §9.2).
 * @property {string[]} [groups]  Flat group ids. No nesting; see spec §9.1.
 * @property {'laptop'|'phone'|'tablet'} deviceType
 * @property {'managed'|'unmanaged'}     deviceTrust
 * @property {'trusted'|'foreign'|'unknown'} location
 * @property {'low'|'medium'|'high'}     riskLevel
 * @property {'low'|'medium'|'high'}     appSensitivity
 */

/**
 * @typedef {object} Policy
 * @property {string}  id
 * @property {string}  name
 * @property {boolean} enabled
 * @property {Partial<SignIn>} conditions   Attributes that must match. AND. Absent = unconstrained.
 * @property {'all'|{users?: string[], groups?: string[]}} [appliesTo]
 *   Who the policy targets. Being in ANY named user or group is enough — this is OR,
 *   unlike conditions. Absent means 'all' (spec §9.2).
 * @property {{users?: string[], groups?: string[]}} [excludes]
 *   Who it never applies to. Exclusion beats inclusion, always (spec §9.3).
 * @property {'block'|'mfa'|'managedDevice'} requirement
 */

/** @type {Policy[]} */
export const POLICIES = deepFreeze([
  {
    id: 'R1',
    name: 'Block unmanaged devices from high-sensitivity apps',
    enabled: true,
    conditions: { deviceTrust: 'unmanaged', appSensitivity: 'high' },
    requirement: 'block',
  },
  {
    id: 'R2',
    name: 'Require MFA for high-sensitivity apps',
    enabled: true,
    conditions: { appSensitivity: 'high' },
    requirement: 'mfa',
  },
  {
    id: 'R3',
    name: 'Require a managed device from untrusted locations',
    enabled: true,
    conditions: { location: 'foreign' },
    requirement: 'managedDevice',
  },
  {
    id: 'R4',
    name: 'Require MFA for high-risk sign-ins',
    enabled: true,
    conditions: { riskLevel: 'high' },
    requirement: 'mfa',
  },
]);

/**
 * @typedef {object} TestCase
 * @property {string}   id
 * @property {string}   description
 * @property {SignIn}   signIn
 * @property {string}   expectedVerdict
 * @property {string[]} [expectedOutstanding]  Requirement types still owed. Only checked when present.
 * @property {string[]} expectedMatched        Policy ids expected to match. Checked once you build the trace.
 */

/** @type {TestCase[]} */
export const CASES = deepFreeze([
  {
    id: 'T1',
    description: 'Managed laptop, trusted network, low-sensitivity app — nothing applies',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted', riskLevel: 'low', appSensitivity: 'low' },
    expectedVerdict: 'allowed',
    expectedOutstanding: [],
    expectedMatched: [],
  },
  {
    id: 'T2',
    description: 'High-sensitivity app from a managed laptop on a trusted network',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted', riskLevel: 'low', appSensitivity: 'high' },
    expectedVerdict: 'challenge',
    expectedOutstanding: ['mfa'],
    expectedMatched: ['R2'],
  },
  {
    id: 'T3',
    description: 'Unmanaged phone reaching a high-sensitivity app — block beats the MFA grant',
    signIn: { deviceType: 'phone', deviceTrust: 'unmanaged', location: 'trusted', riskLevel: 'low', appSensitivity: 'high' },
    expectedVerdict: 'blocked',
    expectedOutstanding: [],
    expectedMatched: ['R1', 'R2'],
  },
  {
    id: 'T4',
    description: 'Managed laptop abroad — the managed-device requirement is already satisfied',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'foreign', riskLevel: 'low', appSensitivity: 'medium' },
    expectedVerdict: 'allowed',
    expectedOutstanding: [],
    expectedMatched: ['R3'],
  },
  {
    id: 'T5',
    description: 'Unmanaged phone abroad — the device cannot become managed, so this is a denial',
    signIn: { deviceType: 'phone', deviceTrust: 'unmanaged', location: 'foreign', riskLevel: 'low', appSensitivity: 'low' },
    expectedVerdict: 'blockedUnsatisfiable',
    expectedOutstanding: [],
    expectedMatched: ['R3'],
  },
  {
    id: 'T6',
    description: 'High-risk sign-in from a managed laptop on a trusted network',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted', riskLevel: 'high', appSensitivity: 'low' },
    expectedVerdict: 'challenge',
    expectedOutstanding: ['mfa'],
    expectedMatched: ['R4'],
  },
  {
    id: 'T7',
    description: 'Unmanaged tablet abroad at high risk — MFA is moot once the device check fails',
    signIn: { deviceType: 'tablet', deviceTrust: 'unmanaged', location: 'foreign', riskLevel: 'high', appSensitivity: 'medium' },
    expectedVerdict: 'blockedUnsatisfiable',
    expectedOutstanding: [],
    expectedMatched: ['R3', 'R4'],
  },
  {
    id: 'T8',
    description: 'Three policies stack; the device requirement is met, MFA still owed',
    signIn: { deviceType: 'laptop', deviceTrust: 'managed', location: 'foreign', riskLevel: 'high', appSensitivity: 'high' },
    expectedVerdict: 'challenge',
    expectedOutstanding: ['mfa'],
    expectedMatched: ['R2', 'R3', 'R4'],
  },
]);

/* ===================================================================== *
 * Phase 7 — targeting. Spec §9.
 *
 * Written before the engine understood any of it, so T9–T13 were failing
 * when they were committed. That is the point: the model is reviewed as a
 * table before it is argued with as an implementation.
 * ===================================================================== */

/**
 * @typedef {object} Principal
 * @property {string}   id
 * @property {string}   name
 * @property {string[]} groups
 */

/**
 * The directory. Four people, chosen so the interesting comparisons are one
 * dropdown apart.
 *
 * bg-01 is in NO groups, deliberately. Keeping break-glass accounts out of
 * every group means a group-targeted policy cannot catch the account by
 * accident, before anyone even reaches exclusions. Belt and braces; both are
 * modelled here.
 *
 * @type {Principal[]}
 */
export const PRINCIPALS = deepFreeze([
  { id: 'alice', name: 'Alice Fernandes',    groups: ['all-staff', 'engineering'] },
  { id: 'sam',   name: 'Sam Okoro',          groups: ['all-staff', 'engineering'] },
  { id: 'raj',   name: 'Raj Mehta',          groups: ['all-staff', 'finance'] },
  { id: 'bg-01', name: 'Emergency access 01', groups: [] },
]);

/**
 * Everyday targeting. Kept apart from LOCKOUT_POLICIES so a tenant-wide block
 * does not swamp every other case.
 *
 * @type {Policy[]}
 */
export const TARGETED_POLICIES = deepFreeze([
  {
    id: 'P2',
    name: 'Require MFA for finance',
    enabled: true,
    appliesTo: { groups: ['finance'] },
    conditions: {},
    requirement: 'mfa',
  },
  {
    id: 'P3',
    name: 'Require a managed device for engineering',
    enabled: true,
    appliesTo: { groups: ['engineering'] },
    // Alice is in engineering and is excluded anyway. This is the case that
    // proves exclusion is unconditional rather than a tie-break.
    excludes: { users: ['alice'] },
    conditions: {},
    requirement: 'managedDevice',
  },
]);

/**
 * The lockout. One policy that blocks everyone, with the emergency-access
 * account excluded — the shape of a real incident-response policy, and the
 * shape that locks out a tenant when the exclusion is forgotten.
 *
 * @type {Policy[]}
 */
export const LOCKOUT_POLICIES = deepFreeze([
  {
    id: 'P1',
    name: 'Block everything during the incident',
    enabled: true,
    appliesTo: 'all',
    excludes: { users: ['bg-01'] },
    conditions: {},
    requirement: 'block',
  },
]);

/** The same benign sign-in for every targeting case, so only the principal varies. */
const BENIGN = {
  deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted',
  riskLevel: 'low', appSensitivity: 'low',
};
const UNMANAGED_PHONE = {
  deviceType: 'phone', deviceTrust: 'unmanaged', location: 'trusted',
  riskLevel: 'low', appSensitivity: 'low',
};

const who = (id) => {
  const p = PRINCIPALS.find((x) => x.id === id);
  return { user: p.id, groups: p.groups };
};

/**
 * Targeting cases. Each carries its own policy set; the runner uses
 * `case.policies ?? POLICIES`.
 *
 * @type {TestCase[]}
 */
export const TARGETING_CASES = deepFreeze([
  {
    id: 'T9',
    description: 'Raj is in finance, so the finance MFA policy applies to him',
    policies: TARGETED_POLICIES,
    signIn: { ...who('raj'), ...BENIGN },
    expectedVerdict: 'challenge',
    expectedOutstanding: ['mfa'],
    expectedMatched: ['P2'],
  },
  {
    id: 'T10',
    description: 'Alice is in engineering but excluded — exclusion beats inclusion',
    policies: TARGETED_POLICIES,
    signIn: { ...who('alice'), ...UNMANAGED_PHONE },
    expectedVerdict: 'allowed',
    expectedOutstanding: [],
    expectedMatched: [],
  },
  {
    id: 'T11',
    description: 'Sam — same sign-in as T10, same group, not excluded. Opposite outcome',
    policies: TARGETED_POLICIES,
    signIn: { ...who('sam'), ...UNMANAGED_PHONE },
    expectedVerdict: 'blockedUnsatisfiable',
    expectedOutstanding: [],
    expectedMatched: ['P3'],
  },
  {
    id: 'T12',
    description: 'Tenant-wide block during an incident — Raj is locked out, as intended',
    policies: LOCKOUT_POLICIES,
    signIn: { ...who('raj'), ...BENIGN },
    expectedVerdict: 'blocked',
    expectedOutstanding: [],
    expectedMatched: ['P1'],
  },
  {
    id: 'T13',
    description: 'Break-glass: same block, same sign-in, excluded account still gets in',
    policies: LOCKOUT_POLICIES,
    signIn: { ...who('bg-01'), ...BENIGN },
    expectedVerdict: 'allowed',
    expectedOutstanding: [],
    expectedMatched: [],
  },
]);

/**
 * Everything the runner executes.
 *
 * T10/T11 and T12/T13 are matched pairs: identical sign-ins, different
 * principals, opposite outcomes. If either pair ever agrees, exclusion is not
 * being honoured — and in the T12/T13 case that means a real tenant locked out
 * with nobody able to undo it. Run those two pairs first after any change to
 * targeting.
 */
export const ALL_CASES = deepFreeze([...CASES, ...TARGETING_CASES]);
