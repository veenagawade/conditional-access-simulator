// The policy set the app starts with.
//
// Separate from fixtures.js on purpose. fixtures.js is frozen test data that
// must never change; this is the app's editable starting point. Once the policy
// editor exists, the user changes these freely and the tests are unaffected.
//
// Note this is a FUNCTION, not a constant. A `const DEFAULT_POLICIES = [...]`
// would hand every caller a reference to the same objects — the editor would
// mutate the module's own array, and "reset to defaults" would hand back the
// mutated version. Returning a fresh set on every call makes reset actually
// reset.

/** @returns {import('./fixtures.js').Policy[]} a brand-new, mutable policy set */
export function createDefaultPolicies() {
  return [
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
}

/**
 * Next free policy id — R1, R2 … R5. Used when the editor adds a policy.
 * @param {{id: string}[]} policies
 */
export function nextPolicyId(policies) {
  const numbers = policies
    .map((p) => Number(String(p.id).replace(/^R/, '')))
    .filter((n) => Number.isFinite(n));
  const highest = numbers.length ? Math.max(...numbers) : 0;
  return `R${highest + 1}`;
}
