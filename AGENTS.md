# AGENTS.md

Instructions for AI coding agents working in this repository.

The full guidance lives in [CLAUDE.md](CLAUDE.md). It is tool-agnostic despite the
filename, and it is the single source of truth. Read it before making changes.

The short version:

- **This project is archived.** The product was wound down on 2026-06-11. The Worker
  entry points were restored so the repo runs locally, but every infrastructure
  identifier in the wrangler configs is a placeholder and nothing here deploys.
- **TDD is mandatory.** Failing test first, confirm it fails, minimal implementation,
  confirm it passes, then refactor.
- **95% coverage per file**, not per repo. `perFile: true` in all eight packages.
  If a file you touched drops below 95%, the work is not done.
- **No placeholder code, no TODO/FIXME/HACK comments, no `any`, no unexplained
  `eslint-disable`.**
- **Buttons are pills.** `rounded-full` on every button and button-styled CTA.
- **Ports are 3030 (frontend) and 5030 (backend)**, never the framework defaults.
- **Run the gates before claiming done:** `pnpm run lint`, `pnpm run typecheck`,
  `pnpm run test:coverage`, `pnpm run test:scripts`. `pnpm run verify` runs the
  whole chain including the Playwright matrix.

Orientation for a new agent:

| Question | Read |
|---|---|
| What is this and what are the numbers? | [README.md](README.md) |
| How does a request flow? Where is state? | [ARCHITECTURE.md](portfolio/ARCHITECTURE.md) |
| How is it tested, and what is excluded? | [TESTING.md](portfolio/TESTING.md) |
| What are the design rules and tokens? | [DESIGN.md](portfolio/DESIGN.md) |
| Why was a feature built this way? | [docs/design-docs/](docs/design-docs/) |
