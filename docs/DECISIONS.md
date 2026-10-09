# Decision Log

Short entries, newest first. One decision per entry: what was decided, and why.

---

### 2026-10-09 — Asset and dependency provenance for milestone 3
CLAUDE.md requires licensing provenance to live here, and the reviewer flagged that the milestone-3 additions had none.
- **Comfortaa** (header font, chosen by the owner in DESIGN.md): SIL Open Font License. Loaded via `next/font/google`, which self-hosts it at build time — no runtime request to Google, nothing hotlinked.
- **recharts** `^3.10.1` (the approved charting library): MIT.
- The milestone-3 session/stats code adds no images, audio, or other binary assets. The potato mascot and the paper-grain texture are deferred to milestone 4 and still have no artwork; DESIGN.md's open item records that whatever is used must be original and must not be Ghibli-derived.

### 2026-10-09 — Session writes are fire-and-forget; a lost completion is not retried
`logRunCompletion` does not await the session write, and the timer's persisted state flips to `complete` (clearing `runId` and the end timestamp) before the write resolves. A write that fails or is interrupted is logged to `console.warn` and never retried, so that run is silently absent from stats.
**Why:** keeping the timer responsive and never letting a storage failure break the countdown. The reviewer's correction to the original framing matters, though: this is not only a "tab killed within a few milliseconds" window — a `DatabaseBlockedError` takes ~5s to reject, so with another tab holding the old schema version a completed run is dropped silently.
**How to apply:** accepted for now. The cheap mitigation, if this ever matters: keep `runId`/`endedAt`/`plannedDurationMs` in the persisted state until the write resolves and replay on next load — the existing `&runId` dedup already makes replay safe. Revisit in milestone 7 alongside export/import, since that's when data completeness starts to matter to users.

### 2026-10-09 — Milestone 3 test-coverage debt, accepted deliberately
The reviewer mutation-tested milestone 3 (broke the implementation seven ways and checked whether the suite noticed) and found four behaviour-breaking mutations passing a green suite. Three fixes were applied — reading the `sessions` table directly in e2e instead of inferring from DOM counts, waiting for a positive completion signal before asserting a count did *not* change, and unit-testing the increment rules — and each was verified to actually catch its mutation. The following were consciously deferred rather than forgotten:
- **Two-tab race** is still not genuinely exercised: the existing test completes in tab 1 and only re-reads in tab 2, so no second write is ever attempted. A real race needs an expired running entry in `localStorage` with two tabs rehydrating it.
- **Blocked upgrade** (`DatabaseBlockedError`, the "close other Pomotato tabs" UI) has no test anywhere, despite being the case that resembled task 002's infinite-loading bug.
- **No axe-core run against `/stats`** — `e2e/accessibility.spec.ts` has no `/stats` block. Frontend's axe check was an uncommitted throwaway, which this log's 2026-10-07 entry says is not evidence.
- **Three remaining can't-fail tests** in `e2e/stats.spec.ts` (one with no assertion at all, one asserting only that a computed color is defined, one with its assertion inside a `try`/`catch`), plus a missing `MutationObserver`-based empty-state-flash test.
**Why:** the implementation itself was reviewed and approved, and the three fixes close every mutation that was actually proven to slip through. The rest is coverage completeness, not known-broken behaviour.
**How to apply:** treat these as the first candidates when milestone 3's area is touched again. Note also the generic lesson: `expect(locator).toBeVisible()` on a condition that is *already true* is a fourth distinct "test that cannot fail" shape in this project, after the `try`/`catch`, the assertion-inside-`if`, and the never-attached observer.

### 2026-10-07 — shadcn/ui added for milestone 3 onward only, not retrofitted onto milestones 1-2
Ran `npx shadcn@latest init` (Nova preset, Radix base, CSS variables) to get `components.json`, `lib/utils.ts` (the `cn()` helper, re-exported from the `cn` package — no collision with `lib/db/` or `lib/timer/`), and the `class-variance-authority` / `tw-animate-css` / `radix-ui` / `lucide-react` / `shadcn` dependencies in place. This is infrastructure only: no `npx shadcn add <component>` was run, and no existing component file (`PomotatoTimer.tsx`, `TaskList.tsx`, etc., or anything under `lib/`, `hooks/`) was touched — milestones 1-2 keep their current hand-built markup and their 91 passing e2e tests untouched. shadcn components start getting added once milestone 3 (session logging/stats) actually needs one, chosen for what that task needs rather than guessed in advance.

The CLI's install step (`npm install ... class-variance-authority tw-animate-css radix-ui lucide-react`, and later `cn`/`shadcn` itself) hit the same pre-existing `vitest@5.0.3` / `@types/node@^20` peer conflict noted in the 2026-10-02 dependency entry below. Worked around it the same way: ran the installs with `--legacy-peer-deps` (`npm_config_legacy_peer_deps=true` in the environment for the `shadcn init` invocation, since the CLI doesn't expose its own `--legacy-peer-deps` flag), rather than touching `@types/node` or `vitest` versions.

`shadcn init`'s default output overwrites `app/globals.css` with its own generic oklch-based blue/slate theme and drops the project's warm cream/brown palette entirely, plus a broken `--font-sans: var(--font-sans)` self-reference and a `html { @apply font-sans; }` rule that would have swapped the rendered body font from the approved Arial/Helvetica fallback to Geist Sans. Let the CLI write its default output once, then hand-reconciled it: kept the original `--background` (`#fbf4ea`), `--foreground` (`#2b2017`), the plain-CSS `body` rule, and the `:focus-visible` outline rule byte-for-byte, and mapped every shadcn semantic token (`--primary`, `--border`, `--ring`, `--accent`, `--destructive`, `--chart-*`, `--sidebar-*`, `--radius`) onto the literal colors milestones 1-2 already use via Tailwind utility classes (`--primary`/`--ring` → `#b45309` i.e. `amber-700`, matching the existing primary button and focus outline; `--accent` → `#fef3c7`/`amber-100`, matching the existing pinned/selected highlight; `--border`/`--input` → `#d6d3d1`/`stone-300`; `--destructive` → `#b91c1c`/`red-700`; `--chart-1..5` → the first five hues of the already contrast-checked `components/task-palette-colors.ts` swatches, reused rather than inventing a separate chart palette ahead of milestone 3 deciding it needs one; `--sidebar-*` aliased to the tokens above since no sidebar component exists yet). Dropped the `.dark` block entirely rather than fabricate unreviewed dark-mode colors — dark/theme toggling is explicitly out of scope until milestone 4 per the existing comment in `globals.css`, and nothing in the app ever applies a `.dark` class today. Verified the result is visually identical to before (screenshot comparison, plus all 170 Vitest + 91 Playwright tests, including the axe-core and focus-indicator checks, still pass unchanged) and that `npm run lint` / `typecheck` / `build` are clean.

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
