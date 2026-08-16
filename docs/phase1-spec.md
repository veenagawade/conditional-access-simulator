# Phase 1 — Design spec

> **Action required:** replace this stub with your finished Phase 1 spec, then commit and push.
>
> Once it lives here, every future prompt to Claude can begin with *"read
> `docs/phase1-spec.md`"* — no re-explaining the design, no context lost between sessions.

From what we know it should cover:

## 1. Sign-in attributes
The inputs to an evaluation — user, group membership, target application and its sensitivity
(high / medium / low), network location, device state, client app type, risk level.

## 2. Rule structure
The shape of a policy object: name, enabled flag, conditions (which sign-ins it applies to),
effect (`block` or `grant`), and grant requirements.

## 3. Decision logic
- A `block` from any matching enabled policy wins outright — nothing overrides it.
- Otherwise the grant requirements of every matching policy **stack**; the user must satisfy all
  of them.
- No matching policy means access is granted with no additional requirements.

## 4. Starter rules
The four test policies from Phase 1, with the expected verdict for each scenario. These become
your test cases — write them down as input → expected output pairs before you build the engine.

## 5. Explanation model
For every verdict, which policies matched, which did not, and why. This is the part that makes
the project worth showing to someone.
