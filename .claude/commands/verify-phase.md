# /verify-phase

Purpose: Verify whether a completed phase is actually done.

Input:
- Phase file path
- Optional commit or diff range

Steps:
1. Read `PROGRESS.MD` and `PHASE-00A`; compare Phase checklist and validation log to the phase acceptance criteria.
2. Inspect changed files.
3. Discover available commands.
4. Run relevant checks if possible.
5. Compare implementation to deliverables and acceptance criteria.
6. Report pass/fail with blockers.
7. Update `PROGRESS.MD`: tick verified checklist items, log commands in Validation log, note gaps in Task queue or Future backlog.

Output:
- Phase status: pass, partial, or fail
- Evidence
- Missing deliverables
- Commands run
- Required fixes
