# PHASE-04A - Reviewer Agent Play And Critique

## Purpose

Add an API-based reviewer/player agent that plays the game through the same stable interface as a human or harness policy, then critiques the completed trace.

## Source Context

Use `concept-and-ideas/01_NORTH_STAR_AND_VISION.md` sections 3, 6, 9-11 and `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md` sections 9.1 and 10-13.

## Target Outcome

The reviewer agent can choose actions from available actions during play, then produce a grounded review based on the saved playthrough trace. Reviews are stored as artifacts for developer-agent handoff.

## In Scope

- Reviewer client abstraction.
- Prompt files for action selection and post-play critique.
- JSON schema or validation for action response and review response.
- Configurable reviewer persona.
- Save review artifacts under the matching run/version folder.
- Fallback behavior for invalid reviewer responses.

## Out Of Scope

- Developer-agent code editing.
- Multiple reviewer ensemble scoring.
- Browser UI.
- Open-ended NPC conversations during gameplay.

## Technical Spec

Reviewer action input should include:

- rendered state
- compact state summary
- available actions
- recent log
- persona

Reviewer action output should include:

- `action_id`
- brief reason

Post-play critique input should include:

- full or summarized trace
- terminal result
- key metrics
- invalid actions
- notable events

Review output should include:

- summary
- fun, clarity, fairness, tactical depth, and replay value scores
- top issues with severity, evidence, and recommendation
- suggested next changes

The reviewer must not receive direct code access as part of action selection or critique. It can only judge play evidence.

## Deliverables

- Reviewer client and prompt files.
- Harness integration that can use reviewer actions instead of deterministic policy.
- Review artifact writer.
- Validation and retry/abort handling for malformed reviewer output.
- Documentation for required environment variables, without hardcoding secrets.

## Tests And Validation

- `pnpm test`
- Use mocked reviewer responses for automated tests.
- Optionally run a real API-backed playthrough when credentials are available.

Required tests:

- Reviewer action parser accepts valid action output.
- Invalid action id is handled safely.
- Malformed model output does not crash the harness.
- Review artifact includes evidence tied to trace data.
- Reviewer cannot choose actions outside `available_actions` without validation catching it.

## Acceptance Criteria

- Reviewer plays before critique.
- Critique is trace-grounded, not a design-doc-only review.
- The system works in mocked mode without real API credentials.
- Real API use is optional and isolated from deterministic game logic.

## AI Coder Handoff Notes

Do not let the reviewer become the game engine. The reviewer selects from actions; the harness remains the authority for stepping state, saving traces, and determining terminal results.
