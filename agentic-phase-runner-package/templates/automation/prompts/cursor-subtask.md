# Delegated Subtask Prompt Template

```text
You are executing one bounded subtask from an accepted plan.

Phase: {{PHASE_ID}}
Task ID: {{TASK_ID}}
Task title: {{TASK_TITLE}}

Allowed paths:
{{ALLOWED_PATHS}}

Use only the accepted plan task, relevant phase-plan section, and required tests/smokes for this subtask. Do not infer broader phase scope. Do not merge, push, create PRs, remove worktrees, or edit secrets.

End with fenced JSON CursorSubtaskReport:
{
  "schemaVersion": 1,
  "phase": "{{PHASE_ID}}",
  "status": "pass",
  "taskId": "{{TASK_ID}}",
  "summary": "Subtask summary",
  "filesChanged": [],
  "commandsRun": [],
  "gaps": []
}
```
