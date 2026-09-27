# Phase 1 — Design spec

Status: agreed, with three open decisions marked **DECISION** below.

This document is the contract the engine is built against. If the code and this file disagree,
one of them is wrong — fix it before writing more code.

---

## 1. What describes a sign-in attempt

A sign-in is a plain object with five attributes. Everything the engine knows about a request
comes from here.

| Attribute | Values | Notes |
|---|---|---|
| `deviceType` | `laptop`, `phone`, `tablet` | |
| `deviceTrust` | `managed`, `unmanaged` | Managed = corporate device with security controls applied |
| `location` | `trusted`, `foreign`, `unknown` | `trusted` = known corporate network |
| `riskLevel` | `low`, `medium`, `high` | Set manually per scenario; no risk calculation in scope |
| `appSensitivity` | `high`, `medium`, `low` | Generic tiers, not named applications |

**App sensitivity tiers:**

- **High** — finance systems, admin portals, anything touching money or elevated permissions
- **Medium** — HR systems, internal business tools
- **Low** — wikis, read-only dashboards, nothing sensitive

**Why generic tiers rather than named apps:** the interesting logic is how sensitivity drives
controls. Naming real applications would add data to maintain without adding insight.

---

## 2. What a rule looks like

```js
{
  id: 'r1',
  name: 'Block unmanaged devices from high-sensitivity apps',
  enabled: true,
  conditions: { deviceTrust: 'unmanaged', appSensitivity: 'high' },
  requirement: 'block'   // 'block' | 'mfa' | 'managedDevice'
}
```

| Field | Purpose |
|---|---|
| `name` | Plain English. Should read as a sentence a colleague would understand |
| `enabled` | Rules can be switched off without deleting them |
| `conditions` | Which sign-in attributes must match. Multiple conditions are **AND** |
| `requirement` | Exactly one of: `block`, `mfa`, `managedDevice` |

**Condition matching:** a condition is satisfied when the sign-in's value equals the rule's value.
An attribute absent from `conditions` is not constrained — the rule matches any value for it. A
rule with empty `conditions` matches every sign-in.

**DECISION 1 — one requirement per rule.** Real Conditional Access lets a single policy specify
several grant controls combined with AND or OR. This spec allows exactly one per rule, and gets
combinations by writing multiple rules. Simpler engine, simpler UI, and stacking across rules
already demonstrates the concept. Revisit only if a scenario genuinely can't be expressed.

**DECISION 2 — conditions are exact matches, not lists.** You cannot yet write "location is
`foreign` OR `unknown`" in one rule; that's two rules. Upgrading `conditions` to accept arrays is
a small change if it starts to hurt.

---

## 3. The decision steps

1. Take every rule where `enabled` is true and every condition matches the sign-in. Call these
   the **matched rules**.
2. **No matched rules** → verdict `allowed`. Nothing further required.
3. **Any matched rule with `requirement: 'block'`** → verdict `blocked`. Stop. No grant control
   overrides a block.
4. **Otherwise** → collect the requirements of every matched rule, de-duplicated. Resolve each
   against the sign-in (see §4). The verdict follows from whether they can be satisfied.
5. **Always** record which rules matched, which did not, and why. The explanation is the point of
   the project, not a nice-to-have.

---

## 4. Resolving requirements — DECISION 3

**The problem:** the two grant requirements are not alike.

- `managedDevice` — the sign-in already tells you `deviceTrust`. The engine **can** decide this.
  If the device is unmanaged, the requirement is not merely outstanding, it is **impossible to
  satisfy on this device**.
- `mfa` — nothing in the sign-in says whether the user can complete MFA. The engine **cannot**
  decide this. It can only report that a challenge is owed.

Treating both as "outstanding requirements" would produce a misleading verdict: it would say
*allowed, subject to a managed device* for a request that in reality gets denied at the door.

**Resolution — the engine resolves what it can and reports what it can't.** Four verdicts:

| Verdict | Meaning |
|---|---|
| `allowed` | No matched rules, or all requirements already satisfied |
| `blocked` | A matched rule said `block` |
| `blockedUnsatisfiable` | A requirement the sign-in can answer is not met — e.g. `managedDevice` on an unmanaged device. Effectively denied |
| `challenge` | Only requirements the engine cannot resolve remain — currently just `mfa` |

`blockedUnsatisfiable` is scored *after* `blocked`, so an explicit block still takes precedence in
the explanation.

**Why this matters:** it is the difference between a toy and something that reflects how
Conditional Access actually behaves. "Require compliant device" against an unmanaged laptop is a
denial, not a prompt. Getting this right is the single most demonstrable piece of understanding
in the whole project.

---

## 5. Starter rules

Proposed — adjust names and conditions to taste, but keep the overlaps. The overlaps are what
exercise the engine.

| ID | Name | Conditions | Requirement |
|---|---|---|---|
| R1 | Block unmanaged devices from high-sensitivity apps | `deviceTrust: unmanaged`, `appSensitivity: high` | `block` |
| R2 | Require MFA for high-sensitivity apps | `appSensitivity: high` | `mfa` |
| R3 | Require a managed device from untrusted locations | `location: foreign` | `managedDevice` |
| R4 | Require MFA for high-risk sign-ins | `riskLevel: high` | `mfa` |

R1 and R2 overlap deliberately — that's the block-wins case. R3 and R4 overlap on a foreign
high-risk sign-in, which is the stacking case.

---

## 6. Test cases

**Write these into the code before writing the engine.** They are the definition of correct.

| # | Sign-in | Matched | Expected verdict |
|---|---|---|---|
| T1 | laptop, managed, trusted, low risk, low app | none | `allowed` |
| T2 | laptop, managed, trusted, low risk, high app | R2 | `challenge` — mfa |
| T3 | phone, unmanaged, trusted, low risk, high app | R1, R2 | `blocked` — R1 wins outright |
| T4 | laptop, managed, foreign, low risk, medium app | R3 | `allowed` — managedDevice already satisfied |
| T5 | phone, unmanaged, foreign, low risk, low app | R3 | `blockedUnsatisfiable` — device cannot become managed |
| T6 | laptop, managed, trusted, high risk, low app | R4 | `challenge` — mfa |
| T7 | tablet, unmanaged, foreign, high risk, medium app | R3, R4 | `blockedUnsatisfiable` — R3 fails; mfa is moot |
| T8 | laptop, managed, foreign, high risk, high app | R2, R3, R4 | `challenge` — mfa; managedDevice satisfied |

T4, T5 and T7 are the cases a naive implementation gets wrong — one that treats both grant
requirements as merely outstanding instead of resolving what the sign-in can answer. It reports a
challenge for T5 and T7, which are denials, and a challenge for T4, which is allowed because the
device is already managed. Note that it errs in both directions.

A subtler mistake — scoring `unresolved` before `failed` in §4 — breaks **T7 alone**, the only case
where an unsatisfiable requirement and an unresolvable one appear together.

*Corrected 27 Sep 2026: this section previously claimed the naive implementation broke T5 and T7
only, and the project status notes claimed swapping the two scoring steps broke T5 and T7. Both
were checked by building the two wrong engines and running the eight cases against them. Neither
claim was right.*

---

## 7. Explanation model

Every verdict returns a trace:

```js
{
  verdict: 'blockedUnsatisfiable',
  requirements: [{ type: 'managedDevice', status: 'failed', because: 'device is unmanaged' }],
  matched:   [{ id: 'r3', name: '…', why: 'location = foreign' }],
  unmatched: [{ id: 'r1', name: '…', why: 'appSensitivity is low, rule requires high' }]
}
```

`unmatched` matters as much as `matched`. "Why did this policy *not* apply?" is the question that
actually gets asked during an incident.

---

## 8. Known simplifications

Recorded deliberately, not overlooked. Each is a candidate for a later phase.

- ~~**No user or group targeting.**~~ **Closed by §9** (Phase 7). Policies are assigned to users
  and groups with exclusions, and **emergency access ("break-glass") accounts are excluded from
  every policy** — the lesson behind more than one real tenant lockout.
- **No report-only mode.** Real policies run `on`, `report-only`, or `off`. Report-only is how
  changes are validated safely before enforcement. Currently `enabled` is a boolean.
- **No session controls** (sign-in frequency, persistent browser).
- **Risk is an input, not a calculation.** Deliberate — risk scoring is a different project.
- **No policy ordering.** Correct: Conditional Access policies are unordered and all evaluated.
  This is an accurate model, not a simplification.

---

## 9. Targeting — users, groups and exclusions

Added Phase 7. §8 listed "no user or group targeting" as the most interview-relevant gap. This
section closes it, and it is the only part of the model where getting it wrong locks people out
of a real tenant.

---

### 9.1 The sign-in gains a principal

A sign-in has been five attributes since §1. It now also says *who*:

```js
{
  user: 'alice',
  groups: ['all-staff', 'engineering'],
  deviceType: 'laptop', deviceTrust: 'managed', location: 'trusted',
  riskLevel: 'low', appSensitivity: 'low',
}
```

`groups` is flat — no nesting, no dynamic membership. Real directories have both; neither changes
the evaluation logic, which is what this project is about.

### 9.2 A policy gains targeting

```js
{
  id: 'R1',
  name: 'Block everything during the incident',
  enabled: true,
  appliesTo: 'all',                      // or { users: [...], groups: [...] }
  excludes: { users: ['bg-01'] },        // optional
  conditions: {},
  requirement: 'block',
}
```

| Field | Meaning |
|---|---|
| `appliesTo` | `'all'`, or an object naming users and/or groups. Being in **any** named user or group is enough — this is OR, unlike `conditions`, which is AND |
| `excludes` | Users and groups the policy never applies to. Optional; absent means excludes nobody |

**Absent `appliesTo` means `'all'`.** The four starter policies in §5 have no targeting and must
keep behaving exactly as before, which is what T1–T8 continue to assert.

**A sign-in with no principal matches only untargeted policies.** It cannot be included by name or
group, because it has neither.

### 9.3 The resolution rule — DECISION 4

A policy is **in scope for a principal** when:

```
included AND NOT excluded
```

where `included` is `appliesTo === 'all'`, or the user is named, or any of the principal's groups
is named; and `excluded` is the user being named in `excludes.users`, or any of their groups being
named in `excludes.groups`.

**Exclusion beats inclusion. Always. With no override.**

Not when the user is also named explicitly in `appliesTo`. Not when the inclusion is more specific
than the exclusion. Not when the policy is a block and the exclusion looks like a mistake. There is
no "but I added them deliberately" path, and the absence of that path is the entire safety
property.

**Why this asymmetry is the point.** Emergency access — "break-glass" — accounts exist so that
somebody can still sign in when a policy change has gone wrong. They work by being excluded from
every policy. If exclusion could ever lose to an inclusion, the account that is supposed to be
immune to a bad policy could be caught by one, and the tenant locks out the only people able to
fix it. That is not hypothetical; it is the mechanism behind more than one real lockout.

A rule that is unconditional is a rule you can reason about at 3am. One with exceptions is not.

### 9.4 Where targeting sits in the decision order — DECISION 5

Targeting is evaluated **before** conditions. §3 step 1 becomes:

> Take every rule where `enabled` is true, **the principal is in scope**, and every condition
> matches the sign-in.

The ordering does not change *which* policies match — both orders produce the same set, because
matching requires all three. It changes **what the explanation says**, and that is the entire
reason to specify it.

An excluded principal should be told:

> `alice is excluded from this policy`

and not:

> `location is trusted, rule requires foreign`

Both are true. Only the first is the answer. During an incident, "why did my break-glass account
get through?" and "why did this block not catch that user?" are the same question, and an
explanation that names a device attribute instead of the exclusion sends the reader to the wrong
place. Explanation quality is a design requirement in this project (§7), not a nicety, so the
order is fixed by the spec rather than left to the implementation.

### 9.5 The principals

A tiny directory. Four people, chosen so the interesting comparisons are one dropdown apart.

| Id | Name | Groups |
|---|---|---|
| `alice` | Alice Fernandes | `all-staff`, `engineering` |
| `sam` | Sam Okoro | `all-staff`, `engineering` |
| `raj` | Raj Mehta | `all-staff`, `finance` |
| `bg-01` | Emergency access 01 | *(none)* |

**`bg-01` is in no groups at all**, and that is deliberate rather than lazy. Keeping break-glass
accounts out of every group is itself standard practice: it means a group-targeted policy cannot
catch the account by accident, before anyone even gets to exclusions. Belt and braces, and both
are modelled here.

### 9.6 Test cases

**Write these before the engine, as in §6.** They use two extra policy sets so a tenant-wide block
does not swamp everything else.

```js
TARGETED = [
  P2: Require MFA for finance
      appliesTo { groups: ['finance'] },  requirement mfa
  P3: Require a managed device for engineering
      appliesTo { groups: ['engineering'] }, excludes { users: ['alice'] },
      requirement managedDevice
]

LOCKOUT = [
  P1: Block everything during the incident
      appliesTo 'all', excludes { users: ['bg-01'] }, conditions {}, requirement block
]
```

| # | Set | Principal | Sign-in | Matched | Expected |
|---|---|---|---|---|---|
| T9 | TARGETED | `raj` | managed laptop, trusted, low, low | P2 | `challenge` — in finance |
| T10 | TARGETED | `alice` | unmanaged phone, trusted, low, low | none | `allowed` — excluded from P3 |
| T11 | TARGETED | `sam` | unmanaged phone, trusted, low, low | P3 | `blockedUnsatisfiable` |
| T12 | LOCKOUT | `raj` | managed laptop, trusted, low, low | P1 | `blocked` |
| T13 | LOCKOUT | `bg-01` | managed laptop, trusted, low, low | none | `allowed` — break-glass |

**T10 and T11 are the same sign-in.** Same device, same location, same risk, same app. The only
difference is who is signing in, and the outcomes are opposite: Alice is excluded from P3 and gets
in; Sam is in the same group and is denied. If those two ever return the same verdict, exclusion is
not being honoured.

**T12 and T13 are also the same sign-in**, and they are the demonstration this whole section
exists for: a tenant-wide block that stops everyone, and one emergency-access account that still
gets through. T13 failing means a real tenant would be locked out with nobody able to undo it.

T10/T11 and T12/T13 are the pairs to run first after any change to targeting.

---
