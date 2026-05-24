# Dungeon Forge: Adversarial Agentic Game Development

Dungeon Forge is a local-first research and development testbed for improving a small, finite, text/ASCII turn-based game through an adversarial agent loop. One agent builds or changes the game. Another agent plays through a stable structured-action interface, reviews trace evidence, and pressures the next version toward better design without breaking protocol invariants.

The project is intentionally bounded. It is not a commercial engine, a real-time game, a browser-first product, or an open-ended LLM world simulator. The goal is to prove that a small playable game can improve over multiple versions while preserving deterministic gameplay, measurable evidence, and human-governed acceptance.

## Current Status

The repository now contains an implemented TypeScript/pnpm/Vitest project, a finite text/ASCII dungeon game, deterministic harness commands, generated version evidence, optional credential-gated LLM paths, local human and browser play/replay tools, static evidence viewers, content governance, optional-media metadata checks, control-room artifacts, and a restricted API coding-agent harness.

Current coordination state lives in `PROGRESS.MD`. Phase state currently records the PHASE-23 through PHASE-31 automation stretch as complete; `phase-plans/` remains the source of truth for individual phase contracts and acceptance criteria.

Important sources:

| Path | Purpose |
| --- | --- |
| `concept-and-ideas/` | Product vision, bounded creative freedom, and long-term roadmap intent |
| `phase-plans/` | Phase contracts and acceptance criteria |
| `PROGRESS.MD` | Live handoff, active task queue, checklist, and validation log |
| `src/game/**` | Game rules, state transitions, seeded randomness, content, and rendering |
| `src/harness/**` | Playthrough runners, traces, reviews, scorecards, evidence, validation, and automation |
| `src/browser-play/**` | Local browser play and read-only replay surface over structured game actions |
| `src/control-room/**` | Local timeline, role metadata, static web shell, handoffs, narration, and base-selection artifacts |
| `src/dashboard/**` | Local static version-dashboard generation from existing evidence |
| `src/static-demo/**` | Local static demo export from existing evidence |
| `content/**` | Static finite game data, scenario packs, extension packs, and optional-media metadata |
| `runs/**` | Generated evidence; useful for audit and demos, not design truth |
| `docs/**` | Current feature docs, validation notes, runbooks, and audit artifacts |

## North Star

Dungeon Forge asks one central question:

```text
Can an adversarial developer/reviewer agent loop improve a small playable game over multiple versions while preserving a stable game protocol and producing measurable evidence of improvement?
```

The intended loop is:

```text
Developer agent creates or improves a game version
  -> Harness runs the game through a stable text/action interface
  -> Player/reviewer agent or deterministic policy plays
  -> Trace evidence is saved
  -> Reviewer critique and scorecards are generated from evidence
  -> Developer receives a scoped improvement task
  -> Tests, simulations, traces, scorecards, and acceptance checks decide whether the new version is accepted
```

The first target game is a small Mystery Dungeon-style roguelike with finite floors, turn-based movement and combat, text/ASCII rendering, structured actions, seeded randomness, explicit terminal states, and local evidence artifacts.

## Implemented Capabilities

### Game

`src/game/**` implements the stable game contract, seeded randomness, finite dungeon state, map/content loading, combat, enemies, tactical items, traps/resources, challenge modes, scenario packs, extension packs, dialogue/events, ASCII rendering, and protocol-version metadata.

The game remains finite, serializable, turn-based, seedable, and text/ASCII-first. Terminal status is explicit: `ACTIVE`, `WIN`, `LOSS`, or `ABORTED`.

### Harness And Evidence

`src/harness/**` implements deterministic playthrough execution, baseline players, trace and scorecard generation, reviewer artifacts, version summaries, version comparisons, longitudinal benchmarking, balance analytics, developer-task handoffs, patch proposal validation, acceptance reports, trace replay, content governance, optional-media checks, phase automation commands, and the restricted-agent validation/application loop.

Generated evidence exists under `runs/v001`, `runs/v002`, `runs/v003`, and `runs/comparisons`. These artifacts demonstrate the fixed local demo loop and provide audit material for current docs and dashboards. Longitudinal proof is supported by `pnpm run longitudinal-benchmark`, which inspects local version evidence and writes advisory trend artifacts without making acceptance decisions.

### Reviewer And LLM Paths

Gameplay and baseline harness checks run without API credentials. Optional LLM player/reviewer paths are behind explicit provider configuration and validation. Model JSON is validated before use, unavailable or malformed actions fall back to deterministic behavior, and reviewer output never mutates game state directly.

See `docs/REAL-LLM-RUNS.md` for the credential-gated path.

### Human And Static Viewing Surfaces

The repo includes a local terminal human-play path, browser play/replay tooling, trace replay tooling, a version-dashboard exporter, a static-demo exporter, and a control-room static shell. These surfaces inspect or present existing game/evidence data; they do not become the source of truth for game rules.

### Phase Automation

`pnpm run phase` drives phase graph/state inspection, bundle generation, dry-run autopilot paths, accepted-plan execution metadata, gates, and local safety checks. Phase automation is designed to coordinate coding agents while preserving human ownership over merge and acceptance decisions.

## Commands

Install dependencies with `pnpm install` when needed. Useful commands currently defined in `package.json` include:

```sh
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run check
```

Game and harness commands:

```sh
pnpm run simulate-seed
pnpm run run-version
pnpm run summarize-version
pnpm run compare-versions
pnpm run run-balance
pnpm run demo-loop
pnpm run accept-version
pnpm run ci-smoke
pnpm run verify-acceptance-evidence
pnpm run repo-checks
```

Workflow and automation commands:

```sh
pnpm run new-version
pnpm run developer-task
pnpm run patch-proposal
pnpm run worktree-task
pnpm run loop-coordinator
pnpm run phase
pnpm run restricted-agent-dry-run
pnpm run restricted-agent-repair-loop
```

Human play, replay, viewing, and governance commands:

```sh
pnpm run human-play
pnpm run browser-play
pnpm run trace-replay
pnpm run version-dashboard
pnpm run balance-analytics
pnpm run longitudinal-benchmark
pnpm run export-static-demo
pnpm run control-room-web-shell
pnpm run content-governance
pnpm run optional-media
```

Most script commands build first and then execute the corresponding `dist/**` CLI. Check each feature doc for supported flags and expected output paths.

## Architecture Summary

```text
src/
  game/
    engine.ts
    types.ts
    rng.ts
    map.ts
    enemies.ts
    items.ts
    combat.ts
    render.ts
    scenario-packs.ts
    protocol-versions.ts

  harness/
    run-playthrough.ts
    run-version.ts
    summarize-version.ts
    compare-versions.ts
    longitudinal-benchmark-cli.ts
    accept-version.ts
    phase-runner-cli.ts
    trace-replay-cli.ts
    balance-analytics-cli.ts
    content-governance-cli.ts
    restricted-agent/

  browser-play/
    browser-play-cli.ts
    session.ts
    replay.ts
    server.ts

  control-room/
    timeline/
    roles/
    web-shell/
    handoffs/
    narration/

  dashboard/
    version-dashboard-cli.ts

  static-demo/
    static-demo-export-cli.ts

  human-play/
    human-play-cli.ts

  agents/
    prompts/

content/
tests/
runs/
docs/
phase-plans/
automation/
```

Boundary rules:

- `src/game/**` owns game rules, state transitions, seeded randomness, rendering, and serializable state.
- `src/harness/**` owns playthrough execution, trace saving, scorecards, reviewer/client boundaries, validation, and automation.
- `src/agents/prompts/**` owns prompt templates, not game logic.
- `src/browser-play/**` owns local browser play/replay adapters over structured actions and saved traces.
- `src/control-room/**` owns local artifact projection, metadata, handoff preparation, narration, and static control-room presentation.
- `src/dashboard/**` and `src/static-demo/**` render existing evidence; they do not author game state or acceptance facts.
- `content/**` owns finite static data and metadata.
- `tests/**` owns contract, engine, harness, content, automation, and regression coverage.
- `runs/**` owns generated evidence and should not be hand-edited when it can be regenerated.

## Stable Game Contract

Game versions preserve this interface:

```ts
export interface GameEngine {
  start(seed: string, config?: GameConfig): GameState;
  getAvailableActions(state: GameState): PlayerAction[];
  step(state: GameState, action: PlayerAction): StepResult;
  render(state: GameState): string;
  isTerminal(state: GameState): boolean;
}
```

Actions are structured. Players and reviewers choose from available actions; they do not send arbitrary text commands.

```ts
export interface PlayerAction {
  id: string;
  type:
    | "move"
    | "attack"
    | "wait"
    | "use_item"
    | "pickup"
    | "descend"
    | "talk"
    | "inspect";
  label: string;
  payload?: Record<string, unknown>;
}
```

Invalid actions should be reported as invalid step results or trace metadata, not treated as successful play.

## Core Invariants

Every accepted version must preserve these invariants:

- The game is finite.
- Terminal states are explicit: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.
- Output is text/ASCII-first.
- Input is structured through available actions.
- Play is turn-based.
- Randomness is seeded and reproducible.
- Game state is serializable and inspectable.
- The reviewer must play before critique.
- Reviewer critique must cite trace evidence.
- Gameplay must run without API credentials.
- Reviewer output must not mutate game state directly.
- Version acceptance depends on tests, traces, scorecards, required artifacts, and human judgment.

## Evidence Overview

A version is more than a git commit. It is a local evidence bundle.

Current generated evidence includes:

```text
runs/
  v001/
    traces/
    reviews/
    scorecards/
    patch_plan.md
    changelog.md
    developer_notes.md
    balance_summary.json
    acceptance.md
    version_summary.json

  v002/
    traces/
    reviews/
    scorecards/
    developer_task.md
    patch_plan.md
    changelog.md
    developer_notes.md
    balance_summary.json
    acceptance.md
    version_summary.json

  v003/
    traces/
    reviews/
    scorecards/
    developer_task.md
    patch_plan.md
    changelog.md
    developer_notes.md
    balance_summary.json
    acceptance.md
    version_summary.json

  comparisons/
    v001_vs_v002.json
    v001_vs_v002.md
    v001_vs_v003.json
    v001_vs_v003.md
    v002_vs_v003.json
    v002_vs_v003.md
```

Traces are the primary evidence. Scorecards, reviews, comparisons, dashboards, and static demos should remain tied back to trace and artifact paths.

## Forbidden MVP Scope

Do not add or accept:

- real-time combat or timing-sensitive input
- image-only output, required audio, or required generated media
- infinite floors or no-ending sandbox play
- arbitrary free-text gameplay commands
- arbitrary LLM-generated world or story mutation during play
- external API dependency during gameplay
- reviewer output that directly mutates game state
- UI or dashboard surfaces as the source of truth
- scorecards as proof without trace evidence
- tests removed merely to pass a phase

Reviewer requests that conflict with these constraints should be translated into bounded alternatives.

| Reviewer Request | Bounded Translation | Rejected Translation |
| --- | --- | --- |
| "I want visuals." | Improve ASCII map, legend, HUD, trace replay, or static evidence presentation. | Require sprites, screenshots, generated images, or image-only output. |
| "Characters feel shallow." | Add finite NPC dialogue choices and traceable events. | Add open-ended LLM NPC conversations. |
| "I want more replayability." | Add finite seeded variants, challenge modes, scenario packs, or extension packs. | Add endless dungeon mode with no final state. |
| "Combat is boring." | Add turn-based tactical items, enemy behaviors, or trace-backed balance tuning. | Add real-time dodging or reaction combat. |

## Roadmap Boundary

The repo has moved beyond the initial project-structure scaffold, fixed v001-v003 demo loop, and the PHASE-23 through PHASE-31 automation stretch. Recent completed roadmap work includes:

| Phase | Purpose |
| --- | --- |
| `PHASE-23B` - `PHASE-24B` | Current-state docs refresh, longitudinal benchmark, evidence hardening, browser play/replay, and deeper gameplay evaluation |
| `PHASE-25A` - `PHASE-28B` | Control-room timeline, role metadata, web shell, human feedback capture, prepared handoffs, narration, base selection, and polish |
| `PHASE-29A` - `PHASE-31B` | Restricted API coding-agent schemas, context, dry-run loop, source patch validation/application, check repair loop, autopilot delegate integration, and dogfood hardening |

These features are still bounded by the same safety rules: generated evidence is not design truth, UI surfaces do not own game state, and restricted-agent outputs are untrusted JSON intent until the local harness validates and applies them.

## Working Rules For Agents

When doing phase-scoped work:

1. Read `PROGRESS.MD`.
2. Read `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md`.
3. Read the active phase plan.
4. Add or claim a task in `PROGRESS.MD`.
5. Keep scope limited to the active phase unless the user explicitly expands it.
6. Update tests with behavior changes.
7. Append validation evidence to `PROGRESS.MD`.
8. Recheck acceptance criteria against the repo before claiming completion.

For product context, read:

1. `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`
2. `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md`
3. `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`
4. `concept-and-ideas/04_HIGH_LEVEL_PROJECT_PHASES.md`

For current implementation details, prefer the specific feature docs under `docs/` and the live source/tests over older planning prose.
