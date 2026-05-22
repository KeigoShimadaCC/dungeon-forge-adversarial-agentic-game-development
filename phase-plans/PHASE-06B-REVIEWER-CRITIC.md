# PHASE-06B - Reviewer Critic

## Purpose

Generate trace-grounded reviewer critiques after actual playthroughs.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-06B-REVIEWERCRITIC-BUILDING`, the reviewer requirement in `01_NORTH_STAR_AND_VISION.md`, and examples in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

A reviewer critic consumes trace evidence and scorecard context, then writes structured review output with observations, diagnoses, recommendations, and suggested next changes.

## In Scope

- Review generation interface.
- Review prompt template.
- Structured review JSON/Markdown shape.
- Trace evidence citations or references.
- Save reviews under `runs/vXXX/reviews/`.
- Mocked tests for review generation and missing data.

## Out Of Scope

- The LLM playing the game.
- Developer code changes.
- Review based only on design docs or vibes.
- Unlimited free-form mutation of game state.

## Technical Spec

Dependencies: `PHASE-05A-HARNESS`.

Reviewer input includes:

- Trace JSON.
- Scorecard.
- Key rendered states.
- Persona.

Reviewer output should include:

- Summary.
- Scores for fun, clarity, fairness, tactical depth, and replay value.
- Top issues with severity, observation, diagnosis, and recommendation.
- Suggested next changes.

Reviews must cite trace evidence such as turn numbers, terminal result, repeated invalid actions, confusing render states, or observed item/enemy outcomes.

Initial review outputs should support the same personas as the player layer: `careful_player`, `naive_player`, and `bug_hunter`. Reviews may differ by persona, but every recommendation must remain bounded by the global invariants in `PHASE-00A`.

## Deliverables

- Reviewer critic module/client boundary.
- Reviewer prompt template.
- Review output writer.
- Mocked tests.

## Tests And Validation

- Review is generated from mocked trace input.
- Review includes top issues.
- Review includes suggested changes.
- Review cites trace evidence rather than design docs alone.
- Review is saved under `runs/vXXX/reviews/`.
- Missing trace data is handled gracefully.
- Tests do not require real API credentials.

## Acceptance Criteria

- Critique is grounded in actual playthrough evidence.
- Observation, diagnosis, recommendation, and severity are distinct.
- Generated review can become input to the developer-agent workflow.

## AI Coder Handoff Notes

The reviewer can be harsh, but it is not the architect. Translate broad wishes into bounded recommendations that preserve protocol invariants.
