# /plan-phase

Purpose: Convert a phase file into an implementation plan without editing code.

Input:
- Phase file path
- Optional constraints from the user

Steps:
1. Read `PHASE-00A`.
2. Read the requested phase file.
3. Inspect existing repo state.
4. Identify touched boundaries and invariants.
5. Produce a stepwise implementation plan.
6. List verification commands; mark missing commands explicitly.

Stop if:
- The phase conflicts with concept docs.
- Required source files do not exist and the phase does not authorize creating them.
- Product scope is ambiguous.

Output:
- Goal
- Boundaries touched
- Implementation steps
- Tests/checks
- Risks
- Assumptions
