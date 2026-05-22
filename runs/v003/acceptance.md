# Acceptance Report

Version: v003
Generated: 2026-05-22T16:43:14.949Z

## Machine recommendation

Status: pass

Checks: 12 pass, 0 fail, 3 warning, 0 skipped, 0 blocked.

Passing machine checks do **not** auto-accept this version. The human owner remains the final governor.

## Human decision

Status: pending

Owner: _(human owner)_
Decision: _(accepted / rejected / blocked)_
Notes:

## Blockers

- _(none)_

## Risks

- 14 run(s) ended in ABORTED; inspect traces for invalid actions, softlocks, or protocol failures.
- Machine checks passed, but final acceptance still requires explicit human owner approval.

## Checks

| Check | Status | Summary |
| --- | --- | --- |
| Typecheck | PASS | Typecheck reported pass. |
| Tests | PASS | Tests reported pass. |
| Lint | PASS | Lint reported pass. |
| Build | PASS | Build reported pass. |
| Trace coverage | PASS | All 3 expected trace files are present. |
| Review coverage | PASS | All 3 expected review files are present. |
| Scorecard coverage | PASS | All 3 expected scorecard files are present. |
| Terminal outcomes | PASS | All recorded runs reached WIN, LOSS, or ABORTED. |
| Protocol stability metrics | WARNING | 14 run(s) recorded invalid actions or softlocks. |
| Changelog evidence | PASS | changelog.md exists with non-placeholder content. |
| Developer notes evidence | PASS | developer_notes.md exists with non-placeholder implementation notes. |
| Reviewer-driven handoff | PASS | developer_task.md is present for reviewer-driven work. |
| Default evidence matrix | PASS | Default trace/review/scorecard matrix is complete. |
| Forbidden MVP feature checklist | WARNING | Manual verification required: confirm no forbidden MVP feature was introduced in this version. |
| Global forbidden change checklist | WARNING | Manual verification required: confirm developer work respected harness/global forbidden changes. |

## Check details

### Protocol stability metrics

- seed_001/careful_player: invalid_actions=0, softlocks=1
- seed_001/cautious-low-hp: invalid_actions=0, softlocks=1
- seed_001/greedy-item-picker: invalid_actions=0, softlocks=1
- seed_001/random: invalid_actions=0, softlocks=1
- seed_001/stairs-seeking: invalid_actions=0, softlocks=1
- seed_002/cautious-low-hp: invalid_actions=0, softlocks=1
- seed_003/cautious-low-hp: invalid_actions=0, softlocks=1
- seed_003/greedy-item-picker: invalid_actions=0, softlocks=1
- seed_003/random: invalid_actions=0, softlocks=1
- seed_004/cautious-low-hp: invalid_actions=0, softlocks=1
- seed_004/greedy-item-picker: invalid_actions=0, softlocks=1
- seed_004/random: invalid_actions=0, softlocks=1
- seed_005/cautious-low-hp: invalid_actions=0, softlocks=1
- seed_005/random: invalid_actions=0, softlocks=1

## Forbidden MVP feature checklist

Manual verification required before final acceptance:

- Real-time combat or timing-sensitive input.
- Image-only output or required non-text visuals for core gameplay.
- Required audio, voice, or generated media assets.
- Infinite floors or no-ending sandbox play.
- Arbitrary free-text gameplay commands.
- Arbitrary LLM-generated world/story changes during play.
- External API dependency during gameplay.
- Engine rewrites that break the stable game/harness protocol.

## Global forbidden changes

- Change or bypass the stable GameEngine interface (start, getAvailableActions, step, render, isTerminal).
- Remove seed determinism or non-reproducible RNG during gameplay.
- Remove or bypass explicit terminal states (ACTIVE, WIN, LOSS, ABORTED).
- Add infinite floors, sandbox main modes without terminal outcomes, or unbounded play.
- Add real-time input, timing-based combat, or non-turn-based play.
- Require images, audio, or other non-text media for core gameplay.
- Replace structured available actions with arbitrary free-text player commands.
- Call external APIs during gameplay or mutate game state directly from reviewer output.
- Let reviewer or developer self-report replace harness validation and trace evidence.

## Evidence links

- Version directory: `runs/v003`
- Acceptance report: `runs/v003/acceptance.md`
- Patch plan: `runs/v003/patch_plan.md`
- Changelog: `runs/v003/changelog.md`
- Developer notes: `runs/v003/developer_notes.md`
- Summary status: complete
- Artifact coverage: 3/3 traces, 3/3 reviews, 3/3 scorecards
