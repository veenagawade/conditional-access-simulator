// Phase 2 — the evaluation engine
//
// This is the substance of the project. Everything else is a viewer for it.
// Implement `evaluate()` below until all eight cases in tests.html pass.
//
// Spec: docs/phase1-spec.md §3 (decision steps) and §4 (resolving requirements).

/**
 * Does this policy apply to this sign-in?
 *
 * Every key in `conditions` must equal the same key on the sign-in. Keys absent
 * from `conditions` are unconstrained. An empty `conditions` object matches
 * everything. Disabled policies never match.
 *
 * Given to you — it's mechanical, and not the interesting part.
 *
 * @param {import('./fixtures.js').Policy} policy
 * @param {import('./fixtures.js').SignIn} signIn
 * @returns {boolean}
 */
export function matches(policy, signIn) {
  if (!policy.enabled) return false;
  return Object.entries(policy.conditions).every(([key, value]) => signIn[key] === value);
}

/**
 * Can the sign-in itself answer this requirement?
 *
 * Returns 'satisfied' | 'failed' | 'unresolved'.
 *   - 'managedDevice' is decidable from `signIn.deviceTrust`.
 *   - 'mfa' is not decidable — nothing in the sign-in says whether the user can
 *     complete a challenge — so it stays 'unresolved'.
 *
 * YOUR CODE.
 *
 * @param {'mfa'|'managedDevice'} requirement
 * @param {import('./fixtures.js').SignIn} signIn
 * @returns {'satisfied'|'failed'|'unresolved'}
return 'failed';
 */
export function resolveRequirement(requirement, signIn) {
  if (requirement === 'managedDevice') {
    if (signIn.deviceTrust === 'managed') return 'satisfied';
    return 'failed';
  }
  return 'unresolved';
}

/**
 * Evaluate a sign-in against a set of policies.
 *
 * The decision steps, from spec §3 and §4:
 *
 *   1. Matched  = every enabled policy whose conditions match the sign-in.
 *   2. If any matched policy has requirement 'block'      → 'blocked'. Stop.
 *   3. Resolve each remaining requirement against the sign-in.
 *   4. If any resolves to 'failed'                        → 'blockedUnsatisfiable'.
 *   5. If any remain 'unresolved'                         → 'challenge'.
 *   6. Otherwise                                          → 'allowed'.
 *
 * Note the ordering in 2 and 4: an explicit block outranks an unsatisfiable
 * requirement. Both deny, but they deny for different reasons and the
 * explanation must say which.
 *
 * Return shape:
 * {
 *   verdict:      'allowed' | 'blocked' | 'blockedUnsatisfiable' | 'challenge',
 *   requirements: [{ type, status, because }],   // one per de-duplicated requirement
 *   matched:      [{ id, name, why }],
 *   unmatched:    [{ id, name, why }]
 * }
 *
 * Build it in two passes. Get `verdict` right first — that alone turns all eight
 * tests green. Then fill in `requirements`, `matched` and `unmatched`, which is
 * what makes the app worth showing anyone.
 *
 * YOUR CODE.
 *
 * @param {import('./fixtures.js').SignIn} signIn
 * @param {import('./fixtures.js').Policy[]} policies
 */

/** "appSensitivity = high and deviceTrust = unmanaged" */
function describeConditions(conditions) {
  return Object.entries(conditions)
    .map(([key, value]) => `${key} = ${value}`)
    .join(' and ');
}

function whyNotMatched(policy, signIn) {
  if (!policy.enabled) return 'policy is disabled';

  const failing = Object.entries(policy.conditions)
    .find(([key, value]) => signIn[key] !== value);

  if (!failing) return 'all conditions met';
  const [key, required] = failing;
  return `${key} is ${signIn[key]}, rule requires ${required}`;
}

function requirementReason(status) {
  if (status === 'satisfied') return 'the device is already managed';
  if (status === 'failed') return 'the device is unmanaged and cannot satisfy this';
  return 'the sign-in cannot say whether MFA can be completed';
}

export function evaluate(signIn, policies) {
  const matched = policies.filter(p => matches(p, signIn));

    const matchedTrace = matched.map(p => ({
    id: p.id,
    name: p.name,
    why: describeConditions(p.conditions),
  }));

    const unmatchedTrace = policies
    .filter(p => !matched.includes(p))
    .map(p => ({ id: p.id, name: p.name, why: whyNotMatched(p, signIn) }));
  
    const trace = { matched: matchedTrace, unmatched: unmatchedTrace };

  const blocker = matched.find(p => p.requirement === 'block');
  if (blocker) return { verdict: 'blocked', requirements: [], ...trace };

  const types = [...new Set(matched.map(p => p.requirement))];
    const requirements = types.map(type => {
    const status = resolveRequirement(type, signIn);
    return { type, status, because: requirementReason(status) };
  });

  if (requirements.some(r => r.status === 'failed')) return { verdict: 'blockedUnsatisfiable', requirements, ...trace };
  if (requirements.some(r => r.status === 'unresolved')) return { verdict: 'challenge', requirements, ...trace };
  return { verdict: 'allowed', requirements, ...trace };
}
