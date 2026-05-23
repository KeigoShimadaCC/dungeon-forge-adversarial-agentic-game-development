# Cursor Implementation Prompt Template

Use this for the first Cursor Agent CLI pass.

```text
You are a coding agent working in {{WORKTREE_PATH}}.

Model expectation: Composer 2.5.

Task:
Implement {{PHASE_ID}} according to {{PHASE_PLAN_PATH}}.

Context:
- Read AGENTS.md.
- Read PROGRESS.MD.
- Read concept-and-ideas/01_NORTH_STAR_AND_VISION.md.
- Read concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md.
- Read phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md.
- Read {{PHASE_PLAN_PATH}}.

Ownership:
- You may edit only these paths unless the phase plan clearly requires a narrower subset:
{{ALLOWED_PATHS}}
- Do not edit .env files, credentials, unrelated private files, or generated run evidence unless explicitly required by the phase.
- Do not revert unrelated changes.

Required workflow:
1. Update PROGRESS.MD task queue before implementation.
2. Implement the phase in small, reviewable changes.
3. Add or update tests for behavior changes.
4. Run targeted checks, then the required local validation commands when practical.
5. Append validation results and blockers to PROGRESS.MD.
6. Re-read the phase acceptance criteria and report whether each criterion is met.

Final response:
- Summary of changes.
- Files changed.
- Commands run and results.
- Acceptance checklist with met/not met.
- Gaps fixed.
- Remaining gaps, if any, with blocking/non_blocking/out_of_scope classification.
- End with a fenced JSON report using schemaVersion 1:
  {"schemaVersion":1,"phase":"{{PHASE_ID}}","status":"pass","summary":"","filesChanged":[],"commandsRun":[],"acceptance":[],"gaps":[]}
```
