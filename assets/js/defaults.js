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
 *
 * Deliberately recycles. Delete R4, add a policy, and it is R4 again.
 *
 * That is fine HERE, and it is worth saying why, because "never recycle
 * identifiers" is a real rule in identity systems and this is not a case of
 * it. Recycling a SID or an object GUID is dangerous because ACLs, tokens,
 * group memberships and audit logs all point AT that identifier, so handing it
 * to a new principal silently grants them the old one's access.
 *
 * Nothing points at a policy id here. It labels a row, appears in the
 * explanation, and sits in an export. No other policy references one, nothing
 * stores one, and import replaces a set wholesale rather than merging — so two
 * exported files where R5 means different things is no more a collision than
 * two spreadsheets both having a row 5.
 *
 * Within a set this is collision-free by construction: highest + 1 is greater
 * than every id present.
 *
 * @param {{id: string}[]} policies
 */
export function nextPolicyId(policies) {
  const numbers = policies
    .map((p) => Number(String(p.id).replace(/^R/, '')))
    .filter((n) => Number.isFinite(n));
  const highest = numbers.length ? Math.max(...numbers) : 0;
  return `R${highest + 1}`;
}

/**
 * The app's directory of principals — spec §9.5.
 *
 * A frozen const, not a function, and the difference from createDefaultPolicies()
 * above is deliberate. Policies are editable: the user adds, edits and deletes
 * them, so every caller needs its own copy or "reset to defaults" hands back a
 * mutated set. The directory is read-only in this app — you pick who is signing
 * in, you do not invent people — so one shared frozen copy is honest and
 * cheaper. If a later phase adds a principal editor, this becomes a function
 * for exactly the reason that one is.
 *
 * Duplicated from fixtures.js on purpose, under the same rule as the policies:
 * if the tests imported the app's data, changing a principal here would
 * silently change what the tests assert.
 *
 * bg-01 is in no groups at all. Keeping break-glass accounts out of every group
 * means a group-targeted policy cannot catch the account by accident, before
 * anyone even reaches exclusions.
 *
 * @type {readonly {id: string, name: string, groups: readonly string[]}[]}
 */
export const PRINCIPALS = Object.freeze([
  Object.freeze({ id: 'alice', name: 'Alice Fernandes',     groups: Object.freeze(['all-staff', 'engineering']) }),
  Object.freeze({ id: 'sam',   name: 'Sam Okoro',           groups: Object.freeze(['all-staff', 'engineering']) }),
  Object.freeze({ id: 'raj',   name: 'Raj Mehta',           groups: Object.freeze(['all-staff', 'finance']) }),
  Object.freeze({ id: 'bg-01', name: 'Emergency access 01', groups: Object.freeze([]) }),
]);

/** The principal the app starts on. An ordinary member of staff, not the break-glass account. */
export const DEFAULT_PRINCIPAL_ID = 'alice';
