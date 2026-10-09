@AGENTS.md

# Pomotato

A local-first, cozy Pomodoro focus dashboard with an original potato mascot. No server database in v1; "backend" means the Dexie data layer and Next.js route handlers.

## Stack
Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui (Radix UI primitives + class-variance-authority under the hood, milestone 3 onward only), Zustand + `persist`, Dexie (IndexedDB), dnd-kit, Recharts, Vitest + Testing Library, Playwright. Ask before changing this stack.

## Commands
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — Vitest unit tests (wired up once milestone 1 adds the dependency)
- `npm run test:e2e` — Playwright e2e tests (same — not installed yet)

## Folder structure
No `src/` — app code lives at the repo root (create-next-app default; see [docs/DECISIONS.md](docs/DECISIONS.md)).
- `app/` — routes (App Router)
- `components/` — shared UI components, PascalCase filenames
- `components/ui/` — shadcn-generated components (milestone 3 onward); the existing flat `components/*.tsx` files stay where they are, untouched
- `lib/db/` — Dexie schema, repositories, migrations, export/import (backend-owned)
- `lib/` — other shared utilities
- `hooks/` — custom React hooks, `use-` prefix
- `docs/` — plan, decisions, task files — this is how agents talk to each other

## Code conventions
- TypeScript strict, no `any`.
- Functional components, named exports.
- Accessibility: every interactive element keyboard-reachable, visible focus state, semantic HTML before ARIA.
- Remaining timer value is always derived from a stored end timestamp, never counted via `setInterval` ticks.
- Original assets only. No copied branding, UI, or copy from other apps. Audio must be CC0 or equivalently licensed, with provenance noted in `docs/DECISIONS.md`.

## Team workflow
This session is the orchestrator. It delegates to five subagents in `.claude/agents/`: `pm`, `frontend`, `backend`, `qa`, `reviewer`. Each role's full responsibilities, boundaries, and definition of done live in its own agent file — this section is just the pipeline shape.

For any non-trivial feature:
1. **pm** writes `docs/tasks/<id>-<slug>.md` from the goal (next unchecked item in `docs/PLAN.md`, or a direct ask).
2. **backend** goes first if the task's data shape is undecided; otherwise **backend** and **frontend** may run in parallel, but only while they touch disjoint files.
3. **frontend** implements against the task file's acceptance criteria.
4. **qa** writes and runs tests, appends a QA Report (PASS/FAIL) to the task file.
5. On FAIL, the report goes back to whichever agent owns the failing area. Max 3 fix loops — after that, stop and ask the user instead of looping again.
6. **reviewer** (read-only) reviews the diff and appends Review Findings.
7. Orchestrator summarizes the outcome to the user.

Trivial changes (typos, one-line fixes) skip this pipeline entirely.

## Hard rules
- Agents communicate through files in `docs/`, never through chat with each other.
- Only `frontend` and `backend` edit application code (`app/`, `components/`, `lib/`, `hooks/`).
- `qa` edits test files only (`*.test.ts(x)`, `e2e/**`) plus its own task file's QA Report section.
- `reviewer` is read-only: no edit/write tools, read-only shell commands only.
- Never commit or push without explicit user approval — also enforced by `.claude/settings.json` and its hooks.

## Reference
- Milestones: [docs/PLAN.md](docs/PLAN.md)
- Decision log: [docs/DECISIONS.md](docs/DECISIONS.md)
- Task template: [docs/tasks/_template.md](docs/tasks/_template.md)
- Agent definitions: `.claude/agents/`
- Permissions/hooks: `.claude/settings.json`

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read these installed skill files directly (use these paths even if a same-named global skill exists):
- Core filter, always on: `antislop`: `.claude/skills/antislop/SKILL.md`
- UI / visual: `antislop-ui`: `.claude/skills/antislop-ui/SKILL.md`
- Code comments: `antislop-code`: `.claude/skills/antislop-code/SKILL.md`
- Copy & text: `antislop-copywriting`: `.claude/skills/antislop-copywriting/SKILL.md`
- People: `antislop-human`: `.claude/skills/antislop-human/SKILL.md`
- Mobile / responsive: `antislop-layoutmobile`: `.claude/skills/antislop-layoutmobile/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: `npx antislop-ai --update`, or run `npx antislop-ai` and pick Overwrite them.
<!-- antislop:end -->
