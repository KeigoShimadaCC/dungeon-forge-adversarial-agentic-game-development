# North Star Gap Audit

Date: 2026-05-24

Scope: PHASE-23A docs-only audit of phase plans, concept alignment, current docs, automation metadata, and roadmap gaps. No gameplay, harness, content, tests, package scripts, or generated run evidence were changed.

## Summary

The repository is directionally aligned with the North Star. It now contains a finite text/ASCII game, structured actions, seeded deterministic runs, trace-backed reviewer and scorecard artifacts, local acceptance evidence, phase automation, human terminal play, replay, dashboard/static demo surfaces, content governance, optional media metadata, and autopilot safety hardening.

The largest gaps are no longer basic scaffold or game-contract gaps. They are current-state documentation drift, stronger longitudinal proof beyond the fixed v001-v003 demo, validation hardening around existing artifacts, a browser play/replay surface, and deeper evaluation of gameplay quality and problem runs.

## Phase Plan Coverage

Audit command:

```text
node -e "const fs=require('fs'); const path=require('path'); const required=['Purpose','Source Context','Target Outcome','In Scope','Out Of Scope','Technical Spec','Deliverables','Tests And Validation','Acceptance Criteria','AI Coder Handoff Notes']; const files=fs.readdirSync('phase-plans').filter(f=>/^PHASE-.*[.]md$/.test(f)).sort(); const bad=[]; for (const f of files){const s=fs.readFileSync(path.join('phase-plans',f),'utf8'); const missing=required.filter(h=>!s.split('\n').some(line=>line.trim()==='## '+h)); if(missing.length) bad.push({file:f,missing});} console.log(JSON.stringify({count:files.length,bad}, null, 2));"
```

Result before adding PHASE-23A roadmap files:

```json
{
  "count": 46,
  "bad": []
}
```

Finding: all 46 pre-existing formal `PHASE-*.md` files use the required 10-section schema from PHASE-00A.

## Automation Coverage

`automation/phase-graph.json` ended at `PHASE-22A` before this phase. `automation/phase-state.json` also listed `currentPhase` as `PHASE-22A`, with phases through `PHASE-22A` marked complete.

Finding: the automation metadata needed a new roadmap tail so the next phase runner can discover PHASE-23B and later phases instead of stopping at the untracked-file autopilot safety patch.

PHASE-23A adds graph/state entries for:

- `PHASE-23A` - North Star gap planning.
- `PHASE-23B` - Current state docs refresh.
- `PHASE-23C` - Longitudinal improvement benchmark.
- `PHASE-23D` - Evidence validation hardening.
- `PHASE-24A` - Browser play and replay UI.
- `PHASE-24B` - Gameplay evaluation depth.

## Concept Alignment

The concept documents ask for a bounded loop where a developer agent improves a small finite text/ASCII game after a reviewer/player actually plays through a stable interface and creates trace-grounded critique.

Current alignment:

- Finite terminal states, structured actions, seeded randomness, and text/ASCII rendering exist in the game layer.
- Harness flows produce traces, scorecards, reviews, summaries, comparisons, acceptance evidence, and dashboard/static-demo artifacts.
- Baseline, scripted, LLM-backed, and human-play paths exist without making API credentials mandatory for gameplay.
- Phase automation exists, including graph/state metadata, prompts, local evidence gates, secret/path safety checks, and dry-run smokes.
- Generated evidence under `runs/**` demonstrates v001-v003 iteration and comparison.

Remaining concept gaps:

- The v001-v003 story is useful demo evidence, but not enough longitudinal proof that the loop can keep improving across repeated future versions.
- Current evaluation is stronger than early scorecards, but tactical depth, enemy/map pressure, and problem-run explanations can be deeper.
- Browser play and replay inspection are natural next surfaces because TypeScript and local evidence already support them, but they should remain secondary to the headless engine and trace truth.
- Documentation still reads as if the project is near PHASE-01A, which makes the current capabilities harder for agents and humans to trust.

## Stale Documentation And Metadata

Files with stale scaffold-era wording:

- `README.md` says the repository is in the planning / early scaffold stage, says no TypeScript app scaffold exists, and points the active phase at PHASE-01A.
- `docs/NORTH_STAR.md` calls itself a scaffold mirror and describes the MVP shape as not implemented in Phase 01A.
- `docs/RULES.md` calls itself a scaffold mirror and says the current repository slice is scaffold-only.
- `package.json` describes the project as `Agentic adversarial game-development testbed (Phase 01A scaffold)`.
- `PROGRESS.MD` was already carrying an unrelated in-progress security-audit handoff when this PHASE-23A docs-only pass began; this audit preserves that as pre-existing work and uses PHASE-23A only to set the next roadmap handoff.

These should be fixed in PHASE-23B, not during PHASE-23A, to keep this pass limited to planning artifacts.

## Ranked Gaps

1. Current-state documentation drift.
   Suggested phase: PHASE-23B. The docs need to match the implemented repo before future agents use them as onboarding context.

2. Longitudinal improvement proof.
   Suggested phase: PHASE-23C. The North Star asks whether the loop can improve over multiple versions; the current fixed demo evidence should become a reproducible benchmark story.

3. Evidence validation hardening.
   Suggested phase: PHASE-23D. Future Backlog entries around browser/static smokes, JSON output assertions, replay smoke coverage, deterministic reports, and missing evidence should be triaged into tests or explicit blockers.

4. Browser play and replay UI.
   Suggested phase: PHASE-24A. A local browser surface would improve human inspection and playtesting while preserving the headless harness as source of truth.

5. Gameplay evaluation depth.
   Suggested phase: PHASE-24B. The repo needs deeper tactical, enemy, map, balance, scenario, and problem-run metrics to support richer reviewer and developer decisions.

## Roadmap Decisions

- PHASE-23A is documentation and metadata only.
- PHASE-23B should refresh README, `docs/NORTH_STAR.md`, `docs/RULES.md`, and stale package metadata.
- PHASE-23C should prove improvement through a reproducible local benchmark, not a one-off story.
- PHASE-23D should consolidate deferred validation hardening before adding another UI surface.
- PHASE-24A should add browser play/replay without moving game rules into the browser.
- PHASE-24B should deepen evaluation after browser inspection exists, while keeping human acceptance in charge.

## Validation Notes

PHASE-23A validation should confirm:

- Existing 46 formal phase plans pass the 10-section schema audit.
- New PHASE-23A through PHASE-24B plans also pass the schema audit.
- Graph entries point to existing plan files.
- Graph dependencies form the intended chain from PHASE-22A through PHASE-24B.
- `git diff --check` passes.

Final PHASE-23A validation result:

```json
{
  "phasePlanSchema": {
    "count": 52,
    "bad": []
  },
  "graphTail": ["PHASE-23A", "PHASE-23B", "PHASE-23C", "PHASE-23D", "PHASE-24A", "PHASE-24B"],
  "graphErrors": [],
  "jsonParse": "ok",
  "gitDiffCheck": "pass"
}
```

No `pnpm test` run is required for this phase unless source, tests, package scripts, or runtime behavior are changed.
