# Validation Gates

This document is the single place to find required local and CI checks for Dungeon Forge. The harness validates versions; developer self-report is not sufficient on its own.

## Required gates (credential-free)

Run from the repository root:

```bash
pnpm run check
```

`check` runs, in order:

1. `pnpm test` — Vitest unit and integration tests
2. `pnpm run typecheck` — TypeScript `--noEmit`
3. `pnpm run lint` — ESLint
4. `pnpm run build` — compile harness CLIs to `dist/`
5. `pnpm run ci-smoke` — deterministic in-memory playthroughs over all canonical regression seeds (`seed_001`–`seed_005`) and baseline policies (`random`, `stairs-seeking`, `cautious-low-hp`, `greedy-item-picker`) using the default smoke version (`v001`). Smoke fails only on harness protocol problems (`invalid_actions`, non-terminal `ACTIVE`), not on gameplay `ABORTED`/`LOSS` outcomes or balance softlock heuristics.
6. `pnpm run verify-acceptance-evidence` — when `runs/<version>/` contains changelog and trace or acceptance evidence, re-run the Phase 11A acceptance gate with pass statuses for the repo gates above and fail on missing artifacts or machine `fail` / `blocked` recommendations. Explicit `--version` checks also fail when that version has no acceptance evidence.

No API credentials or external services are required for these gates.

## Individual commands

| Command | Purpose |
| --- | --- |
| `pnpm test` | Test suite |
| `pnpm run typecheck` | TypeScript check |
| `pnpm run lint` | Lint |
| `pnpm run build` | Compile TypeScript |
| `pnpm run ci-smoke` | Deterministic harness smoke (JSON result on stdout) |
| `pnpm run verify-acceptance-evidence` | Acceptance evidence verification for discovered versions |
| `pnpm run repo-checks` | Smoke plus acceptance verification in one step |
| `git diff --check` | Whitespace/conflict marker check before commit |

## Evidence validation smokes

PHASE-23D keeps these checks local-first and credential-free. Use them when validating generated evidence claims without requiring a browser or API keys:

```bash
pnpm test tests/evidence-validation-hardening.test.ts
pnpm test tests/content-governance.test.ts tests/trace-replay.test.ts tests/version-dashboard.test.ts tests/static-demo.test.ts tests/longitudinal-benchmark.test.ts tests/ci-checks.test.ts
pnpm run version-dashboard -- --runs-root . --json
pnpm run export-static-demo -- --runs-root . --json
pnpm run export-static-demo -- --runs-root . --markdown
pnpm run content-governance -- --format json
pnpm run trace-replay -- --trace runs/v001/traces/seed_001_careful_player.json --mode verify
pnpm run verify-acceptance-evidence -- --runs-root . --version v003
```

The dashboard, static demo, and longitudinal benchmark read source artifacts from `runs/**`. Their generated summaries are not proof by themselves: trace and scorecard source files must exist, parse as JSON, and match the version/seed/persona/result recorded in `version_summary.json`. Missing, malformed, or mismatched sources must be reported as explicit diagnostics or missing evidence.

Browser validation is optional in this phase. If a local browser cannot launch, use the JSON/Markdown/HTML commands above as the fallback and record the browser blocker separately from product validation. Real browser play UI work belongs to PHASE-24A.

Generated report timestamps such as `generated_at` and `generatedAt` are derived metadata. Compare stable report content separately from these timestamp fields unless a command explicitly documents a stable timestamp mode.

Committed trace replay verification is a required stale-evidence smoke for the canonical demo evidence. If `pnpm run trace-replay -- --trace runs/v001/traces/seed_001_careful_player.json --mode verify` fails after gameplay or harness changes, regenerate the canonical evidence with `pnpm run demo-loop -- --runs-root .` and rerun the replay command before treating dashboard, static demo, benchmark, or acceptance summaries as current.

### Useful flags

```bash
pnpm run ci-smoke -- --version v003
pnpm run verify-acceptance-evidence -- --runs-root . --version v003
pnpm run repo-checks -- --runs-root . --smoke-version v001 --skip-acceptance-evidence
```

## GitHub Actions

Pull requests and pushes to `main` run `.github/workflows/ci.yml`, which executes `pnpm run check` on Ubuntu with Node 22 and pnpm 10.

CI fails when tests, typecheck, lint, build, smoke runs, or acceptance evidence verification fail. Missing or incomplete acceptance evidence for a version directory that claims evidence is reported explicitly in stderr.

## What these gates do not prove

- Human owner acceptance (still `pending` in `acceptance.md` by design)
- Real LLM reviewer or player runs (credential-gated; later phases)
- Deployment or hosted dashboards

Record command output in `PROGRESS.MD` → Validation log when completing phase work.
