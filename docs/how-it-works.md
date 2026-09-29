# How it works

A walk through the evaluation model behind the simulator, and the decisions I made building it.

**Live site:** https://veena-ca-simulator.netlify.app/ — it opens on the case worth seeing.

---

## The problem this is about

Conditional Access is easy to configure and hard to reason about.

The portal makes each policy look self-contained: pick some conditions, pick a control, save. But
policies are unordered and all of them are evaluated, so the thing that decides an outcome is
never one policy — it is whatever combination of them happens to match a given sign-in. Add a
fifth policy and you have changed the behaviour of the other four, in ways nobody wrote down.

So the question people actually ask is not "what does this policy do?" It is:

- Why was this sign-in blocked?
- Why did the policy I was counting on *not* apply?
- If I turn this on, who stops being able to work?

Those are questions about the evaluation model, not about the UI. This project exists to make
that model visible and testable: define policies, describe a sign-in, get a verdict and a
per-policy account of how it was reached.

## The model, in one page

A sign-in is five attributes. That is everything the engine knows about a request:

| Attribute | Values |
|---|---|
| `deviceType` | laptop, phone, tablet |
| `deviceTrust` | managed, unmanaged |
| `location` | trusted, foreign, unknown |
| `riskLevel` | low, medium, high |
| `appSensitivity` | low, medium, high |

App sensitivity is a generic tier rather than a named application, deliberately. The interesting
logic is how sensitivity drives controls; naming real apps would add data to maintain without
adding insight.

A policy is a name, an enabled flag, some conditions, and one requirement:

```js
{
  id: 'R1',
  name: 'Block unmanaged devices from high-sensitivity apps',
  enabled: true,
  conditions: { deviceTrust: 'unmanaged', appSensitivity: 'high' },
  requirement: 'block'        // 'block' | 'mfa' | 'managedDevice'
}
```

Conditions are ANDed. An attribute absent from `conditions` is unconstrained, which means a
policy with *no* conditions matches every sign-in — the configuration behind most accidental
lockouts, and the reason the simulator flags it in amber rather than leaving the cell blank.

Evaluation then runs in a fixed order:

1. **Match.** Every enabled policy whose conditions all equal the sign-in's values.
2. **Blocks win.** If any matched policy says `block`, the verdict is `blocked` and evaluation
   stops. No grant control overrides a block.
3. **Stack the rest.** Collect the requirements of every other matched policy, de-duplicated.
4. **Resolve each one** against the sign-in — and this is where it gets interesting.

Step 3 is worth pausing on. Requirements *stack*: two policies asking for two different things
means the user owes both, not whichever is stricter. That is a place people's intuition tends to
fail, because the portal presents each policy as a separate decision.

## The decision that matters

The two grant requirements are not the same kind of thing, and treating them as though they were
is the single most consequential mistake available here.

**`managedDevice`** — the sign-in already tells you `deviceTrust`. The engine *can* decide this.
And if the device is unmanaged, the requirement is not merely outstanding: it is impossible to
satisfy on this device.

**`mfa`** — nothing in a sign-in record says whether the user is able to complete a challenge.
The engine *cannot* decide this. It can only report that a challenge is owed.

The naive implementation collects both into a bucket of "outstanding requirements" and reports
something like *allowed, subject to a managed device*. That sentence is wrong in a way that
matters. The request does not get allowed subject to anything. It gets denied at the door,
because the device it came from cannot become managed by answering a prompt.

So the engine resolves what it can and reports what it cannot, and there are four verdicts rather
than two:

| Verdict | Meaning |
|---|---|
| `allowed` | Nothing matched, or every requirement is already satisfied |
| `blocked` | A matched policy said `block` |
| `blockedUnsatisfiable` | A requirement the sign-in *can* answer came back unmet |
| `challenge` | Only requirements the engine cannot resolve remain |

**`blocked` and `blockedUnsatisfiable` both deny the request, and they are different denials.** A
block means policy forbids this outright — the answer is to change the policy or don't do that. An
unsatisfiable requirement means you would be let in from a compliant device — the answer is to get
on one. Same outcome, completely different next action, so the engine reports them separately.

The ordering is load-bearing, and the eight test cases in the spec pin it down. Two different
wrong implementations fail in two different ways, which I checked by building both:

**The naive version** — treating both requirements as merely outstanding — breaks **T4, T5 and
T7**, and it is wrong in both directions. It reports a challenge for T5 and T7, which are actually
denials. It also reports a challenge for T4, which is actually *allowed*, because the device is
already managed and there was never anything to prompt for. Refusing to resolve what you can costs
you accuracy on the permissive side as well as the restrictive one.

**Swapping the two scoring steps** — checking unresolved before failed — breaks only **T7**: the
single case where an unsatisfiable requirement and an unresolvable one are present at once. It
reports a challenge, quietly losing the fact that the device disqualifies the request outright.
T7 is the narrowest of the eight and exactly the case a hand-written suite would omit, which is
the argument for writing the cases down before the engine rather than after.

In the UI both denials are red, and only the wording distinguishes them. That is deliberate:
colour carries severity, words carry cause. Colouring `blockedUnsatisfiable` amber would imply the
user can clear it by answering something, which is the precise misreading this whole model exists
to prevent.

If there is one thing to take from this project, it is this section. "Require compliant device"
against an unmanaged laptop is a denial, not a prompt.

## Why the policies that *didn't* match get equal billing

The result panel gives as much room to the policies that did not apply as to the ones that did,
and it does not hide them behind a toggle.

That is because "why was this blocked?" is the easy question. The hard one, the one asked at 9pm
during an incident, is **"why did the policy I was counting on not apply?"** A tool that answers
only the first question sends you back to reading policy definitions by hand.

Two details in there took more thought than they look like they did:

**Every failing condition is reported, not the first one.** Naming a single blocker invites you to
change that attribute, re-evaluate, and discover the policy still doesn't match. A partial answer
to "why didn't this apply?" is worse than a verbose one.

**A disabled policy says whether it *would* have matched.** "Policy is disabled" is true and
useless. The question you actually have before turning a policy on is whether it will catch this
traffic — which is what report-only mode exists to answer in real Conditional Access. So the
simulator distinguishes *"policy is disabled — it would match this sign-in if enabled"* from
*"policy is disabled, and location is trusted, rule requires foreign"*.

## Exclusion beats inclusion, and never loses

A policy applies to a sign-in when the principal is **included and not excluded**. That second
half is unconditional. Not when the user is also named explicitly in the inclusion. Not when the
inclusion is more specific. Not when the exclusion looks like somebody's mistake.

The asymmetry is the entire safety property, and it exists for one reason.

Emergency access accounts — "break-glass" — are ordinary accounts that every policy is told to
leave alone. They are what you sign in with when a policy change has gone wrong. If exclusion
could ever lose to an inclusion, the account that is supposed to be immune to a bad policy could
be caught by one, and the tenant locks out the only people able to undo it. That is not a thought
experiment; it is the mechanism behind more than one real lockout.

So the rule has no exceptions. A rule without exceptions is a rule you can reason about at 3am.

The simulator has a button for this. It loads a single policy that blocks everyone during an
incident, with one account excluded, and signs you in as that account — verdict `allowed`, under a
policy that blocks everything. Switch the dropdown to anybody else and the same sign-in comes back
`blocked`. The explanation for the account that got through says exactly why:

> `bg-01 is excluded from this policy`

That line is the answer to the question asked during a real incident, and it is why targeting is
evaluated before conditions. An excluded principal could equally truthfully be told "location is
trusted, rule requires foreign" — but that sends the reader to look at devices when the answer is
about people.

A second, quieter practice is modelled alongside it: the emergency-access account is in **no
groups at all**. A group-targeted policy cannot reach it even before exclusions are considered.
Belt and braces, and both belts are real.

## Taking in someone else's policy set

Export is a download; there is no interesting decision in it. Import is where the decisions are,
because an imported file is the only untrusted input this app has.

**Validation reports every problem, not the first one.** A validator that stops at the first error
turns one broken file into five rounds of fix-and-retry, and none of those rounds shows you the
shape of what is actually wrong. The cost is that every check has to carry on after it fails,
which is more code than an early return — worth it, because the person holding the broken file is
usually not the person who wrote it.

**Import is all-or-nothing.** A partial import would leave you holding some of your old policies
and some of theirs, in an order nobody chose, with no way to tell which was which. A policy set
has no safe halfway state, so a rejection ends with *nothing was changed*.

What it checks is the vocabulary, not just the shape: unknown condition keys, values outside the
allowed set, duplicate ids, unrecognised requirements, and exclusions naming principals that do
not exist. That last one matters more than it looks — an exclusion pointing at a deleted account
is a break-glass account that is no longer excluded from anything, and it fails silently, in the
direction of *more* access.

This is also what makes the engine's strictness affordable. `resolveRequirement` throws on a
requirement it does not recognise, which would be reckless if an arbitrary JSON file could reach
it. It cannot: the editor offers three requirements, and import rejects anything else at the door.
Unreachable by construction is exactly when a loud failure costs nothing.

## What this deliberately does not model

Each of these is a scoping decision, and each has a cost. They are listed with their costs
because a simulator you cannot see the edges of is not much use.

**Group targeting is in the engine but not in the editor.** Policies can be aimed at named users
or groups, and the test page proves it — but the form only lets you *exclude*. Every policy you
author applies to everyone, minus whoever you tick. That is a deliberate scope line rather than a
missing piece: exclusion is the half that changes outcomes, and it is the shape of a real
incident-response policy.

**No report-only mode.** Real policies run on, report-only, or off; report-only is how a change
gets validated before it enforces anything. Here `enabled` is a boolean, so the simulator can tell
you what a policy *would* do but cannot model the operational practice of finding out safely.
It is the most likely next addition, and the smallest.

**No session controls** — sign-in frequency, persistent browser. They would not exercise the
evaluation model, which is what this project is about.

**Risk is an input, not a calculation.** Deliberate. Risk scoring is a different project entirely,
and faking it would make the rest less trustworthy rather than more.

**One requirement per policy, and conditions are exact matches.** You cannot write "location is
foreign OR unknown" in a single policy — that is two policies. Combinations come from stacking
across policies, which demonstrates the concept at a fraction of the complexity. Both are small
changes if a scenario genuinely can't be expressed.

**No policy ordering** — and this one is not a simplification. Conditional Access policies are
unordered and all evaluated. Modelling them any other way would be wrong.

## What building it taught me

**The spec earned its keep.** The decision order and the eight test cases were written down before
any engine code existed, and two of those cases — T5 and T7 — are the only reason the
resolvable-versus-unresolvable distinction survived implementation. Without them I would have
built the plausible version and never known.

**Storing the input beats storing the output.** The app keeps the sign-in and recomputes the
verdict on every render, rather than keeping the result. That one choice is why editing a policy
re-evaluates automatically, with no cache to invalidate and no way for the screen to show a
verdict that is no longer true. The same pattern turns up three separate times in the codebase
once you start looking for it.

**Being precise about what you don't know is a feature.** Where the engine can't explain
something, it says so. An unrecognised verdict renders a loud error rather than an empty box that
looks like a pass, and an unrecognised *requirement* throws rather than quietly falling through to
"prompt for MFA". That fallthrough was the original behaviour, and it is the worst failure
available to an access decision: the engine asks the user for something instead of admitting it
did not understand the policy, so the run looks like it worked. A confident-sounding default hides
exactly the class of bug worth catching.

**Explaining a denial is harder than producing one.** The verdict was a day's work. The
explanation — which policies, which conditions, which requirement, and why each one landed where
it did — was most of the project. That ratio seems about right, and it matches which half people
actually need.

---

*Design spec, including the full decision order and the thirteen test cases:*
[`docs/phase1-spec.md`](phase1-spec.md)
