# Restricted API Coding Agent

The restricted API coding agent is a small, harnessed delegate. It is not a Cursor,
Codex, or Claude Code clone. The model is untrusted and never receives direct
authority to edit the repository, run shell commands, use git, install packages,
open pull requests, merge, or decide acceptance.

## Architecture

```text
phase/autopilot runner
  -> restricted-agent context builder
  -> API LLM
  -> structured JSON action proposal
  -> deterministic validator
  -> deterministic patch applier
  -> whitelisted checks
  -> evidence report
  -> local/autopilot gate
```

PHASE-29A defines only the contract and schema boundary. It does not call an LLM,
read files for context, apply patches, run checks, or integrate with autopilot.

## Trust Boundary

The API model may only return JSON intent. The local harness remains the trusted
policy authority.

The model can request:

- `search_allowed`
- `read_file_range`
- `propose_patch`
- `request_check`
- `explain_blocker`

The harness decides whether any requested read, patch, check, or blocker record
is valid. A valid schema response is not permission to mutate the repo.

## Turn Input

The harness packages a bounded turn input:

- phase ID
- accepted plan task ID
- task objective
- allowed paths
- forbidden paths
- relevant snippets
- previous failed checks
- patch budget
- available command IDs

Future phases will build the context package. This phase only defines the type.

## Model Output

The model must return a strict JSON object:

```json
{
  "schemaVersion": 1,
  "phase": "PHASE-29A",
  "taskId": "task-001",
  "action": "propose_patch",
  "rationale": "Fixes a missing validation case.",
  "patches": [
    {
      "path": "src/harness/example.ts",
      "kind": "replace_exact",
      "expected": "old exact text",
      "replacement": "new exact text"
    }
  ],
  "requestedChecks": ["focused_tests"],
  "blockers": []
}
```

Supported patch intent kinds for v1:

- `replace_exact`
- `insert_before_exact`
- `insert_after_exact`
- `create_file`

These are patch intents only. A later deterministic applier must still validate
scope, exact text, size, file count, credentials, evidence paths, and rollback
requirements before any file changes.

## Command IDs

The model never sends raw shell strings. It may only request command IDs:

```json
{
  "requestedChecks": ["focused_tests", "typecheck"]
}
```

The harness maps those IDs to local command arrays. Unknown IDs block. Strings
that look like raw shell commands also block.

Default command IDs are:

- `focused_tests`
- `all_tests`
- `typecheck`
- `lint`
- `build`
- `repo_check`
- `diff_check`

## Forbidden In V1

The model has no authority to request:

- arbitrary shell commands
- git commands
- package installation
- dependency manifest changes
- lockfile changes
- file deletion
- file rename or move
- direct filesystem writes
- generated evidence edits under `runs/`
- credential or private path edits
- `.env` edits
- commits, pull requests, or merges

The validator rejects direct-authority fields such as `command`, `shell`, `git`,
`delete`, `rename`, `packageInstall`, `dependencyChange`, `lockfileChange`,
`directWrite`, `commit`, and `merge`.

## Evidence

Restricted-agent evidence records capture:

- phase and task ID
- model action
- accepted or blocked decision
- which file ranges were exposed
- requested command IDs
- proposed patch paths
- validation diagnostics

Evidence records intentionally store exposed path/range metadata, not snippet
text. Later phases will add context-builder and patch-application evidence.

## Current Status

PHASE-29A provides the schema, command registry, validator, evidence types, docs,
and focused tests. Later phases will add context building, provider adapters,
deterministic patch validation/application, whitelisted checks, and optional
autopilot delegate integration.
