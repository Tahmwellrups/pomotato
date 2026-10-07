# Decision Log

Short entries, newest first. One decision per entry: what was decided, and why.

---

### 2026-10-07 — Orchestrator independently re-runs test suites rather than trusting qa/reviewer self-reports
Task 002 (task list) went through qa claiming PASS multiple times while the actual suite had double-digit failures, dismissed as "flaky"/"environmental" when every one checked turned out to be a concrete, deterministic bug (wrong locator, invalid CSS syntax, a test that couldn't fail, an observer that silently never attached). Reviewer also caught cases where its own re-review needed to actually revert a fix and re-run a test to prove the test would catch a regression, rather than trusting that a test "looked" like it covered something.
**How to apply:** before accepting any PASS/APPROVE verdict from a subagent, re-run the relevant suite directly rather than relying on the reported numbers alone, and spot-check that new/changed tests would actually fail against the bug they claim to cover (e.g. temporarily revert the fix and confirm the test fails, then restore it). This is now standing practice for this project's pipeline, not just a one-off fix.

### 2026-10-07 — dnd-kit, `dexie-react-hooks` are in scope without separate approval
Milestone 2 needs `dexie`, `dexie-react-hooks`, and `@dnd-kit/*`. `dexie` and `@dnd-kit/*` are named directly in the approved stack. `dexie-react-hooks` isn't named individually, but it's Dexie's own official companion package for reactive queries in React (not a separate library choice) — approved as part of the already-approved Dexie dependency, not a stack change.

### 2026-10-02 — Who installs the stack's dependencies
Generalized: whichever role's code needs a runtime dependency installs it as part of implementing the task (e.g. `backend` installs `dexie`/`dexie-react-hooks`, `frontend` installs `zustand`/`@dnd-kit/*`). Test tooling (Vitest, Testing Library, `@playwright/test`, any IndexedDB fake, plus their config files) is test infrastructure, not application code, so `qa` installs and configures it as part of writing the first tests in that area — this doesn't violate qa's "test files only" boundary since none of it touches `app/`, `components/`, or `lib/`.

### 2026-10-02 — App code stays at repo root (`app/`, `components/`, `lib/`), not `src/`
Project was bootstrapped by create-next-app with a root-level `app/`. Moving it under `src/` was blocked by the session's permission classifier (treated as irreversible), so the agent-boundary rule in CLAUDE.md refers to `app/`, `components/`, `lib/`, `hooks/` directly instead of a `src/` wrapper.

### 2026-10-02 — Local-first, no server database in v1
All persistence is Dexie (IndexedDB) in the browser. "Backend" means the data layer (schema, repositories, migrations, export/import) and any Next.js route handlers, not a remote DB. Sync is deferred to a later milestone.

### 2026-10-02 — Agent team workflow adopted
PM/frontend/backend/QA/reviewer subagents communicate through files in `docs/`, not chat, so task state survives across sessions and is auditable. See [CLAUDE.md](../CLAUDE.md) "Team workflow".
