# /plan-phase

Purpose: Convert a phase file into an implementation plan without editing code.

Input:
- Phase file path
- Optional constraints from the user

Steps:
1. Read `PROGRESS.MD` (Active Phase, open tasks, backlog).
2. Read `PHASE-00A`.
3. Read the requested phase file.
4. Inspect existing repo state.
5. Identify touched boundaries and invariants.
6. Produce a stepwise implementation plan.
7. List verification commands; mark missing commands explicitly.
8. Propose `PROGRESS.MD` Task queue entries and Phase checklist items (do not tick checklist until work is verified).

Stop if:
- The phase conflicts with concept docs.
- Required source files do not exist and the phase does not authorize creating them.
- Product scope is ambiguous.

Output:
- Goal
- Boundaries touched
- Implementation steps
- Tests/checks
- Proposed `PROGRESS.MD` tasks and checklist lines
- Risks
- Assumptions
