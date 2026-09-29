// Phase 2 — the evaluation engine
//
// This is the substance of the project. Everything else is a viewer for it.
// Implement `evaluate()` below until all eight cases in tests.html pass.
//
// Spec: docs/phase1-spec.md §3 (decision steps) and §4 (resolving requirements).

/* ------------------------------------------------------------------ *
 * The vocabulary — spec §1
 *
 * The five attributes, their labels, and every value each one may take.
 * ONE definition. Both forms render their dropdowns from this, the result
 * chips take their labels from it, and import validation checks against it.
 *
 * It lived in three places until Phase 8 — the two forms' hardcoded <option>
 * lists and a label map in app.js. They never disagreed, but nothing stopped
 * them, and an import validator written against three sources of truth is a
 * validator written three times.
 *
 * It sits in engine.js because these values are what the engine compares
 * against. describeConditions() already lives here for the same reason: this
 * file is not purely decision logic, it owns what a sign-in IS.
 * ------------------------------------------------------------------ */

export const ATTRIBUTES = Object.freeze([
  Object.freeze({ key: 'deviceType',     label: 'Device type',     values: Object.freeze(['laptop', 'phone', 'tablet']) }),
  Object.freeze({ key: 'deviceTrust',    label: 'Device trust',    values: Object.freeze(['managed', 'unmanaged']) }),
  Object.freeze({ key: 'location',       label: 'Location',        values: Object.freeze(['trusted', 'foreign', 'unknown']) }),
  Object.freeze({ key: 'riskLevel',      label: 'Risk level',      values: Object.freeze(['low', 'medium', 'high']) }),
  Object.freeze({ key: 'appSensitivity', label: 'App sensitivity', values: Object.freeze(['low', 'medium', 'high']) }),
]);

/** Just the keys, in display order. */
export const ATTRIBUTE_KEYS = Object.freeze(ATTRIBUTES.map((a) => a.key));

/** The attribute definition for a key, or undefined if the key is not one of ours. */
export const attributeFor = (key) => ATTRIBUTES.find((a) => a.key === key);

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
  if (!inScope(policy, signIn)) return false;
  return Object.entries(policy.conditions).every(([key, value]) => signIn[key] === value);
}

/* ------------------------------------------------------------------ *
 * Targeting — spec §9
 * ------------------------------------------------------------------ */

/**
 * Does this target — an `appliesTo` or an `excludes` — name the principal?
 *
 * OR, not AND: being any one of the named users, or in any one of the named
 * groups, is enough. That is the opposite of `conditions`, where every entry
 * must hold. Worth keeping straight — reading one as the other is how a policy
 * ends up applying to nobody, or to everybody.
 */
function namesPrincipal(target, signIn) {
  if (!target) return false;
  if (signIn.user && (target.users ?? []).includes(signIn.user)) return true;
  const named = target.groups ?? [];
  return (signIn.groups ?? []).some((group) => named.includes(group));
}

/** Absent `appliesTo` means 'all' — spec §9.2, so §5's untargeted rules are unchanged. */
function isIncluded(policy, signIn) {
  const appliesTo = policy.appliesTo ?? 'all';
  return appliesTo === 'all' || namesPrincipal(appliesTo, signIn);
}

function isExcluded(policy, signIn) {
  return namesPrincipal(policy.excludes, signIn);
}

/**
 * Is this policy in scope for whoever is signing in? Spec §9.3.
 *
 *     included AND NOT excluded
 *
 * **Exclusion beats inclusion, always, with no override.** Not when the user is
 * also named explicitly in appliesTo. Not when the inclusion is more specific.
 * Not when the exclusion looks like a mistake.
 *
 * That unconditionality is the entire safety property. Emergency access
 * accounts work by being excluded from every policy; if exclusion could ever
 * lose to an inclusion, the account meant to be immune to a bad policy could be
 * caught by one, and the tenant locks out the only people able to fix it.
 *
 * If you are ever tempted to add an exception here, that is the thing you would
 * be breaking.
 */
export function inScope(policy, signIn) {
  return isIncluded(policy, signIn) && !isExcluded(policy, signIn);
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

/**
 * "appSensitivity = high and deviceTrust = unmanaged"
 *
 * A policy with no conditions gets a sentence rather than an empty string. It
 * is the configuration that most needs explaining — it matches every sign-in,
 * and it is behind most accidental lockouts — so returning '' would leave the
 * one case that matters silent. Every caller needs this phrase, which is why
 * it lives here rather than in each of them.
 */
export function describeConditions(conditions) {
  const entries = Object.entries(conditions ?? {});
  if (!entries.length) return 'matches every sign-in';

  return entries
    .map(([key, value]) => `${key} = ${value}`)
    .join(' and ');
}

/**
 * Why a policy did not apply to this sign-in.
 *
 * Two deliberate choices here, both about the person reading the answer during
 * an incident:
 *
 * 1. EVERY failing condition is reported, not the first one. Naming a single
 *    blocker invites someone to change that one attribute, re-evaluate, and
 *    find the policy still does not match. A partial answer to "why did this
 *    not apply?" is worse than a verbose one.
 *
 * 2. A disabled policy says whether it WOULD have matched. That is the
 *    question you actually need answered before turning a policy on, and it
 *    is what report-only mode exists to answer in real Conditional Access.
 *    Reporting only "policy is disabled" leaves it hanging.
 */
function whyNotMatched(policy, signIn) {
  const who = signIn.user ?? 'this sign-in';

  const failing = Object.entries(policy.conditions ?? {})
    .filter(([key, value]) => signIn[key] !== value)
    .map(([key, required]) => `${key} is ${signIn[key]}, rule requires ${required}`)
    // Semicolons, not "and": each clause already contains a comma, so "and"
    // does not read as a separator once there is more than one failure.
    .join('; ');

  // Targeting is reported ahead of conditions — spec §9.4. Both answers can be
  // true at once, and only this one is useful: during an incident, "why did
  // that account get through the block?" is answered by the exclusion, not by
  // some device attribute that also happened not to match.
  const targeting = isExcluded(policy, signIn)
    ? `${who} is excluded from this policy`
    : isIncluded(policy, signIn)
      ? ''
      // Phrased from the principal, like the exclusion line, so both read
      // correctly on their own AND after "policy is disabled, and ...".
      : `${who} is not in scope for this policy`;

  if (!policy.enabled) {
    // "It would match if enabled" has to account for targeting too, or a
    // disabled policy that excludes you would claim it would catch you.
    if (!targeting && !failing) {
      return 'policy is disabled — it would match this sign-in if enabled';
    }
    return `policy is disabled, and ${[targeting, failing].filter(Boolean).join('; ')}`;
  }

  if (targeting) return targeting;

  // Unreachable for an enabled, in-scope policy: no failing conditions means it
  // matched, so it would not be in the unmatched list. Kept as a guard.
  return failing || 'all conditions met';
}

/**
 * Why a requirement came out the way it did, in plain English.
 *
 * Keyed on the requirement TYPE as well as the status. The earlier version
 * looked only at the status, and every one of its sentences named a device:
 * 'satisfied' meant "the device is already managed", 'unresolved' meant "the
 * sign-in cannot say whether MFA can be completed".
 *
 * That was correct, but only by accident. It held because managedDevice
 * happens to be the only type that resolves and mfa the only one that does
 * not. The moment a third requirement exists — a compliant-network check, a
 * terms-of-use acceptance — the panel would state, with complete confidence,
 * something about devices for a requirement that has nothing to do with
 * devices. Wrong by construction rather than wrong yet.
 *
 * An unknown (type, status) pair gets a sentence that admits what it does not
 * know, rather than borrowing a neighbour's.
 */
const REQUIREMENT_REASONS = {
  managedDevice: {
    satisfied: 'the device is already managed',
    failed: 'the device is unmanaged and cannot satisfy this',
    unresolved: 'the sign-in does not say whether the device is managed',
  },
  mfa: {
    satisfied: 'multi-factor authentication has already been completed',
    failed: 'multi-factor authentication cannot be completed',
    unresolved: 'the sign-in cannot say whether MFA can be completed',
  },
};

function requirementReason(type, status) {
  return REQUIREMENT_REASONS[type]?.[status]
    ?? `this requirement resolved to "${status}", and the engine has no explanation for it`;
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
    return { type, status, because: requirementReason(type, status) };
  });

  if (requirements.some(r => r.status === 'failed')) return { verdict: 'blockedUnsatisfiable', requirements, ...trace };
  if (requirements.some(r => r.status === 'unresolved')) return { verdict: 'challenge', requirements, ...trace };
  return { verdict: 'allowed', requirements, ...trace };
}
