# Maintenance

The _why_ behind [testing.md](testing.md), which covers _where_ each check
lives. Read both before removing or reshaping code, adding a dependency,
moving code between modules, starting a migration, or writing an ADR.

## Checks guide or block

Nobody should need deep knowledge of this repo to change it safely. Our checks
— author-time (types, ESLint rules, zod schemas, build integrations) and
tests — must either **guide** someone to the right change or **block** the
wrong one. The **PR pipeline (GitHub Actions) is the final line of defense**:
anything it doesn't check can be broken by someone who didn't know better, so
knowledge that lives only in someone's head, a comment or a doc is not
protected.

A check that blocks must also guide. Its failure message says **what is
wrong, why it matters and how to fix it**, and links the convention (spec,
ADR, AGENTS.md section) when there is one. A failure that only says "no" sends
the next person looking for whoever knows.

Background: [What's in a Good Error Message?](https://www.morling.dev/blog/whats-in-a-good-error-message/)

## Types first, even if it costs a refactor

Types are the earliest and strongest check (see the order in
[testing.md](testing.md#the-order)). **Always present to the owner when types
could solve the problem**, even when that means refactoring the code under
test (a brand, splitting a function so the illegal state is unrepresentable,
un-exporting a helper so the only entry point is the validated one). The owner
decides whether the refactor is in scope; don't silently settle for a weaker
level.

## No ritual-based programming

A ritual is a manual step someone has to remember: "if you change this, also
change that". Rituals are not allowed, because nobody remembers.

- **Remove the coupling first**: derive one side from the other or give both
  a single source of truth (e.g. the shared `packages/` used by both the site
  and the backend), so there is nothing to keep in sync.
- **If the coupling must exist, guard it with a check** that fails when the
  two sides drift, at the earliest level that can express it (e.g. the
  regenerated `backend/src/gql` is diffed in CI, so a schema change without
  regenerated types fails the PR).
- A comment, doc or convention that says "remember to…" is not a guard. When
  you find one, propose the check that replaces it.

## Migrations get a guard, not a policy

When we move from an old way to a new one (Tina → Vendure catalog, the quote
order → the native order flow), "new code must use the new way" in a doc is a
ritual.

- **Block new uses of the old way with a check**, with an allowlist of the
  existing uses that can only shrink.
- **List every remaining use of the old way** in the migration's roadmap
  entry or ADR, so progress is visible.
- **Plan the path, not just the destination**: steps that can ship on their
  own (see the merge order in [docs/roadmap.md](../roadmap.md)).

Background: [Migrations Done Well](https://web.archive.org/web/20230529080546/https://blog.pragmaticengineer.com/migrations-done-well-executing-them/)

## Understand before you change

- **Find out why something exists before removing or reshaping it** — code, a
  check or a convention that looks pointless. Look at the git history, the
  linked issue or PR, and `docs/adr/`. If you can't find the reason, ask
  instead of removing it.
- **Fix causes, not symptoms.** Never silence an error, a lint rule or a
  failing test just to make it pass. When debugging, state what you observed
  and how your explanation could be proven wrong before changing code.
- **Every suppression carries its reason** (see "No silencing lint/check
  warnings" in [AGENTS.md](../../AGENTS.md)).

Background: [Chesterton's fence](https://earthly.dev/blog/see-state/),
[3 questions that will make you a phenomenal rubber duck](https://blog.danslimmon.com/2024/01/18/3-questions-that-will-make-you-a-phenomenal-rubber-duck/)

## Solve today's problem

- **Build for needs that exist**: the current task or an epic in
  [docs/roadmap.md](../roadmap.md). "We might need it later" without an epic
  is not a reason for an option, abstraction or configuration.
- **Every new dependency needs a reason**: say what it does that the platform
  or our existing dependencies can't. [testing.md](testing.md#tooling)'s
  "install on demand" is the testing case of this rule.

## Code organisation and seams

Improve code organisation whenever you touch it, but be careful with seams:
where code splits into modules or components, what each part owns, and what
is shared. Agents regularly get seams wrong.

- **Seams come from real usage and behaviour, and from the roadmap — not from
  the shape of the code.** Code that looks alike but changes for different
  reasons stays separate; code that always changes together belongs together.
- **The roadmap is [docs/roadmap.md](../roadmap.md)** with the ADRs it links.
- **If you are uncertain about a seam, ask for directions** before moving
  code.

## Decisions (ADRs)

Decisions live in `docs/adr/`. Write one when a decision is hard to reverse,
surprising without context, or the result of a real trade-off.

- **Start as a proposal**: `Status: proposed` before implementing; the owner
  discusses it and sets `accepted` once it's decided.
- **A proposal ranks what matters first**, in order, then judges each option
  against that list. Always include "do nothing / not now".
- **A proposal includes the rollout plan** (see
  [Migrations](#migrations-get-a-guard-not-a-policy)).
- **Agents draft ADRs but never set them to `accepted`.**
- **Keep accepted ADRs short.** When a decision changes, mark the old ADR
  superseded instead of rewriting or deleting it.
