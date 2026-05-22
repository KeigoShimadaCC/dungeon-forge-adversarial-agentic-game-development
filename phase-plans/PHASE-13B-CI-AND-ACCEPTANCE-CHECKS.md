# PHASE-13B - CI And Acceptance Checks

## Purpose

Add repeatable repository checks so pull requests and local acceptance gates prove the game, harness, and evidence loop still work.

## Source Context

Derived from `PHASE-11A-ACCEPTANCE-GATE`, `PHASE-12A-DEMO-LOOP`, the acceptance rules in `02_STRUCTURE_AND_TECH_SPECS.md`, and backlog item `F-06A-005` in `PROGRESS.MD`.

## Target Outcome

The project has a reliable check set for tests, typecheck, lint, build, deterministic smoke runs, and acceptance evidence verification.

## In Scope

- GitHub Actions or equivalent documented CI for repo gates.
- Local check script or command grouping for phase validation.
- Deterministic smoke run over canonical seeds and baseline policies.
- Acceptance evidence checks for required artifacts.

## Out Of Scope

- Deployment.
- Hosted dashboards.
- Secret-dependent LLM runs as required CI.
- Automatic PR merging.

## Technical Spec

Dependencies: `PHASE-12A-DEMO-LOOP`.

The default gate should run without API credentials and should not require external services. It should cover `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, a deterministic harness smoke, and acceptance-report verification when version evidence is present.

## Deliverables

- CI workflow or equivalent check runner.
- Documented local validation command.
- Acceptance-evidence check integration.
- Tests or smoke evidence proving failure states are visible.

## Tests And Validation

- CI/check runner fails on test failure.
- CI/check runner fails or blocks on missing required acceptance evidence.
- Credential-free smoke command passes locally.
- `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` pass.

## Acceptance Criteria

- A PR cannot appear healthy solely from developer self-report.
- Required local gates are documented in one place.
- Missing or blocked checks are reported explicitly.

## AI Coder Handoff Notes

Keep CI deterministic and cheap. Optional real-LLM validation belongs in later credential-gated phases, not the required gate.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
