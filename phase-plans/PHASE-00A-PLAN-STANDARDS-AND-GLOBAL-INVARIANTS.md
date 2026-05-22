# PHASE-00A - Plan Standards And Global Invariants

## Purpose

Define the shared rules that every later phase must follow. This file is the project contract for AI coding agents: it explains how phase docs are structured, what must never be broken, and what the MVP is trying to prove.

## Source Context

This phase is based on all files in `concept-and-ideas/`, especially the north star, the stable technical constraints, and the examples of allowed/rejected developer responses.

## Target Outcome

Future implementation phases can be executed independently while preserving the same product direction: a bounded adversarial loop where a developer agent improves a small playable game after a reviewer agent actually plays it and critiques evidence from traces.

## In Scope

- Establish a standard phase-doc format.
- Define global MVP stack and repository direction.
- Record non-negotiable game and agent-loop invariants.
- Define acceptance/rejection concepts used by all later phases.

## Out Of Scope

- Writing application source code.
- Choosing specific package versions.
- Designing a browser UI, dashboard, database, or production deployment.

## Technical Spec

Every phase doc should include:

- Purpose
- Source Context
- Target Outcome
- In Scope
- Out Of Scope
- Technical Spec
- Deliverables
- Tests And Validation
- Acceptance Criteria
- AI Coder Handoff Notes

Recommended MVP stack:

- Language: TypeScript
- Runtime: Node.js
- Package manager: pnpm
- Tests: Vitest
- Game format: text/ASCII turn-based dungeon
- Reviewer/player agent: LLM API
- Developer agent: Codex CLI, Claude Code, or equivalent coding agent
- Storage: local files
- Versioning: Git commits and tags

Expected repository direction:

- `src/game/` owns the game engine, types, RNG, map, enemies, items, combat, and render logic.
- `src/harness/` owns playthrough execution, trace saving, scorecards, reviewer client integration, and validation.
- `src/agents/prompts/` owns developer and reviewer prompt templates.
- `content/` may hold items, enemies, floor rules, and event data once static content grows.
- `tests/` holds engine, contract, and regression-seed tests.
- `runs/` stores per-version traces, reviews, scorecards, changelogs, developer patch plans, developer notes, and acceptance decisions.
- `docs/` can mirror stable north-star/rules documentation once implementation begins.

Global game invariants:

- Game sessions are finite.
- Terminal states are explicit: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.
- Output is text/ASCII first and must not require images, audio, or video.
- Player input is structured through available actions, not arbitrary free text.
- Play is turn-based, with no timing, dodging, aiming, or reaction tests.
- Randomness is seedable and reproducible.
- Game state is serializable and inspectable.
- The reviewer must play before producing critique.
- The developer may improve content and mechanics but must not break the stable game protocol.
- Every accepted version stores trace, review, scorecard, developer patch plan, changelog, change summary, and acceptance decision artifacts.

Forbidden MVP features:

- Real-time combat.
- Image-only rendering.
- Required voice, music, or generated media assets.
- Infinite floors or no-ending sandbox play.
- Arbitrary LLM world generation during gameplay.
- External API dependency during gameplay.
- Engine rewrites that break the harness.
- Unbounded free-text action parsing.

## Deliverables

- This standards document.
- A phase-plan set that references these invariants when relevant.

## Tests And Validation

- Confirm every phase after this one names its acceptance criteria.
- Confirm no phase requires forbidden MVP features.
- Confirm implementation phases can be executed sequentially without guessing product direction.

## Acceptance Criteria

- The phase standards are explicit enough for another AI coder to follow.
- MVP and roadmap phases are clearly separated.
- Later phases preserve the same stable protocol and bounded-autonomy assumptions.

## AI Coder Handoff Notes

When implementing any later phase, re-read this file first. If a reviewer or developer suggestion conflicts with these invariants, translate it into an allowed bounded implementation or reject it in the phase acceptance notes.
