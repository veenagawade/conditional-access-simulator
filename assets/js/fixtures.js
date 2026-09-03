// Phase 2 — test fixtures
//
// The four starter policies from docs/phase1-spec.md §5, and the eight test
// cases from §6. This file is the definition of "correct". Do not edit it to
// make your engine pass — change the engine, or change the spec first and then
// this file.

/**
 * @typedef {object} SignIn
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
 * @property {'block'|'mfa'|'managedDevice'} requirement
 */

/** @type {Policy[]} */
export const POLICIES = [
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
];

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
export const CASES = [
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
];
