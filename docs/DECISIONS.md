# Decision Log

Short entries, newest first. One decision per entry: what was decided, and why.

---

### 2026-10-02 — Who installs the stack's dependencies
`zustand` is a runtime dependency the feature code needs, so `frontend` installs it as part of implementing a task. Vitest, Testing Library, and `@playwright/test` (plus their config files) are test infrastructure, not application code, so `qa` installs and configures them as part of writing the first tests — this doesn't violate qa's "test files only" boundary since none of it touches `app/`, `components/`, or `lib/`.

### 2026-10-02 — App code stays at repo root (`app/`, `components/`, `lib/`), not `src/`
Project was bootstrapped by create-next-app with a root-level `app/`. Moving it under `src/` was blocked by the session's permission classifier (treated as irreversible), so the agent-boundary rule in CLAUDE.md refers to `app/`, `components/`, `lib/`, `hooks/` directly instead of a `src/` wrapper.

### 2026-10-02 — Local-first, no server database in v1
All persistence is Dexie (IndexedDB) in the browser. "Backend" means the data layer (schema, repositories, migrations, export/import) and any Next.js route handlers, not a remote DB. Sync is deferred to a later milestone.

### 2026-10-02 — Agent team workflow adopted
PM/frontend/backend/QA/reviewer subagents communicate through files in `docs/`, not chat, so task state survives across sessions and is auditable. See [CLAUDE.md](../CLAUDE.md) "Team workflow".
