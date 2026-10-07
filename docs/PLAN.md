# Pomotato — Milestone Plan

Build order. Don't start a milestone until the previous one is PASS + reviewed.

- [x] **1. Focus timer** — modes (focus, short break, long break, custom); remaining time computed from a stored end timestamp, never from `setInterval` ticks. ([docs/tasks/001-focus-timer.md](tasks/001-focus-timer.md))
- [x] **2. Task list** — emoji, color, ETA, completed-pomodoro count, pinned "current task", drag-and-drop ordering. ([docs/tasks/002-task-list.md](tasks/002-task-list.md))
- [ ] **3. Session logging & stats** — log each session, then daily/weekly/monthly stats with charts.
- [ ] **4. Themes** — CSS-variable palettes plus uploaded backgrounds.
- [ ] **5. Ambient soundscape mixer** — layered loops, per-layer volume. CC0/properly licensed audio only.
- [ ] **6. Music embeds** — official embeds from pasted playlist URLs. No scraping, no unofficial APIs.
- [ ] **7. PWA + export/import** — installable PWA, JSON export/import. Sync is a later, separate milestone.

See [DECISIONS.md](DECISIONS.md) for why things ended up this way, and `tasks/` for per-feature specs.
