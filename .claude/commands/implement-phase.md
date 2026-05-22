# /implement-phase

Purpose: Implement one approved phase with bounded scope.

Input:
- Phase file path
- Approved plan or user instruction

Steps:
1. Read `PHASE-00A` and the active phase.
2. Check git status.
3. Implement only phase-scoped changes.
4. Add or update tests with behavior.
5. Run available verification.
6. Review diff against invariants.
7. Summarize files changed, commands run, and residual risks.

Stop if:
- The change would break `GameEngine`.
- Secrets or external-system mutation are involved.
- The requested work expands beyond the active phase.
- Destructive file operations are needed.
