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

T5 and T7 are the cases that would be wrong under a naive implementation. If those two pass, the
engine is right.

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

- **No user or group targeting.** Real policies are assigned to users and groups with exclusions.
  This has real consequences — most notably that **emergency access ("break-glass") accounts must
  be excluded from every policy**, the lesson behind more than one real tenant lockout. Worth
  adding in a later phase; it is the single most interview-relevant feature missing.
- **No report-only mode.** Real policies run `on`, `report-only`, or `off`. Report-only is how
  changes are validated safely before enforcement. Currently `enabled` is a boolean.
- **No session controls** (sign-in frequency, persistent browser).
- **Risk is an input, not a calculation.** Deliberate — risk scoring is a different project.
- **No policy ordering.** Correct: Conditional Access policies are unordered and all evaluated.
  This is an accurate model, not a simplification.
