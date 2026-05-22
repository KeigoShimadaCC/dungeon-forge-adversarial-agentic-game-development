---
paths:
  - "src/game/**"
  - "src/harness/**"
  - "src/agents/prompts/**"
  - "content/**"
  - "tests/**"
  - "runs/**"
---

# Game Protocol Rules

- Preserve `GameEngine.start`, `getAvailableActions`, `step`, `render`, and `isTerminal`.
- Use explicit terminal states: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.
- Only expose structured player actions from `getAvailableActions`.
- Reject or safely handle invalid actions without corrupting state.
- Keep seeded randomness reproducible.
- Keep gameplay independent of reviewer API credentials.
- Save traces, reviews, scorecards, changelogs, patch plans, and acceptance decisions as version evidence.
- Do not let reviewer output directly mutate state; the harness steps the game.
- Add tests for every protocol or artifact-shape change.
- After protocol or harness changes, record verification in `PROGRESS.MD` Validation log and tick relevant Phase checklist items.
