# PHASE-01A - Project Structure

## Purpose

Create the initial TypeScript repository foundation for the game, harness, tests, content, and evidence artifacts.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-01-PROJECTSTRUCTURE-BUILDING` and the repository structure in `02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

A minimal scaffold exists and can run basic typecheck, test, and lint checks without implementing gameplay depth or agent behavior.

## In Scope

- TypeScript project setup.
- `pnpm` package setup.
- Vitest setup.
- Initial folder layout for `src/game`, `src/harness`, `src/agents/prompts`, `content`, `tests`, `runs`, and `docs`.
- Minimal docs that mirror the north star and rules.

## Out Of Scope

- Game mechanics beyond placeholders.
- LLM integration.
- Browser UI, Next.js, database, Docker, dashboard, plugin framework, or deployment.
- Generated `runs/**` evidence.

## Technical Spec

Dependencies: None.

Create the project skeleton with conservative defaults:

- `package.json` scripts for `test`, `typecheck`, and `lint` if lint tooling is installed.
- `tsconfig.json` for Node-oriented TypeScript.
- Vitest config if needed by the selected scaffold.
- Empty or placeholder modules that make imports compile.
- `.gitignore` entries for `node_modules`, build output, local env files, and transient coverage/cache output.

The scaffold must keep gameplay independent of API credentials and must not create browser-only assumptions.

## Deliverables

- Project config files.
- Initial source, content, test, docs, and run directories.
- Basic placeholder tests proving Vitest runs.

## Tests And Validation

- Run `pnpm install` only after `package.json` exists.
- Run `pnpm test`.
- Run `pnpm run typecheck`.
- Run `pnpm run lint` if a lint script exists.

## Acceptance Criteria

- The repo can be installed and checked locally.
- Folder boundaries match the planned architecture.
- No forbidden MVP feature or external gameplay service is introduced.
- Later game contract work can proceed without restructuring.

## AI Coder Handoff Notes

Keep this phase deliberately boring. Do not start implementing the dungeon, harness, reviewer, or developer loop here.
