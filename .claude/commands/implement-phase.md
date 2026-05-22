# /implement-phase

Purpose: Implement one approved phase with bounded scope.

Input:
- Phase file path
- Approved plan or user instruction

Steps:
1. Read `PROGRESS.MD` (Active Phase, task queue, checklist, recent validation log).
2. Read `PHASE-00A` and the active phase.
3. Add or claim tasks in `PROGRESS.MD` Task queue; mark in-progress items `[~]`.
4. Check git status.
5. Implement only phase-scoped changes.
6. Add or update tests with behavior.
7. Run available verification; append results to `PROGRESS.MD` Validation log.
8. Tick completed `PROGRESS.MD` Phase checklist and Task queue items; defer extras to Future backlog.
9. Review diff against invariants.
10. Summarize files changed, commands run, and residual risks.

Stop if:
- The change would break `GameEngine`.
- Secrets or external-system mutation are involved.
- The requested work expands beyond the active phase.
- Destructive file operations are needed.
