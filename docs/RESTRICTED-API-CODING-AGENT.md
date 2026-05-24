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

PHASE-29A defined only the contract and schema boundary. PHASE-29B adds
deterministic context packaging and bounded read/search helpers. PHASE-29C adds
a non-mutating dry-run API loop. PHASE-30A adds deterministic source patch
validation. PHASE-30B adds deterministic application of already-validated patch
plans inside a worktree. These phases still do not run model-requested checks or
integrate with autopilot.

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

The context builder only exposes snippets requested through deterministic local
policy. It does not dump whole worktrees or silently add hidden context.

## Context Builder

The PHASE-29B context builder packages a `RestrictedAgentTurnInput` from:

- phase and accepted-plan task IDs
- task objective
- accepted-task allowed paths
- forbidden paths
- requested snippets
- previous failed check summaries
- patch budgets
- available command IDs

Every requested file must pass both scopes:

- the phase allowed paths
- the accepted-plan task allowed paths

Paths are denied before reading if they are absolute, contain parent traversal,
match forbidden paths, point at `.env`, credentials, secret/private paths,
generated evidence under `runs/`, or fall outside either allowed-path set.

### Read Ranges

`read_file_range` requires explicit positive line ranges. The harness enforces
per-snippet line/byte budgets, total line/byte budgets, binary-file detection,
missing-file diagnostics, and oversized-file diagnostics.

Large files are not included wholesale. The model receives exact snippets only
after the local harness approves the path and range.

### Search

`search_allowed` scans only the allowed intersection. Results are deterministic:
normalized path order, then line number. Each result contains only:

- path
- line number
- short matched-line preview

Search does not expose full files and stops at configured result/preview budgets.

### Context Evidence

The exposure report records metadata for snippets that reached the model:

- path
- start line
- end line
- byte length
- diagnostics

Evidence intentionally does not store hidden extra snippet text. Denied, missing,
binary, oversized, out-of-scope, and budget-exhausted context requests are
diagnostics, not silent omissions.

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

For the restricted-agent path, strict JSON means the raw response must be one
JSON object. Markdown fences and surrounding prose are rejected before schema
validation. This is intentionally stricter than older reviewer/player helpers
that may extract JSON from prose.

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

## Dry-Run API Loop

`pnpm run restricted-agent-dry-run` runs the first API loop in dry-run mode. It
writes evidence only and never applies patches, runs requested checks, commits,
opens pull requests, merges, or reads extra files beyond the provided context.

Fake provider mode is deterministic and credential-free:

```bash
pnpm run restricted-agent-dry-run -- --provider fake --phase PHASE-29C --task task-001 --out runs/restricted-agent/PHASE-29C/smoke-valid
```

Malformed fake output is useful for blocked-evidence smokes:

```bash
pnpm run restricted-agent-dry-run -- --provider fake --fake-response malformed --phase PHASE-29C --task task-001 --out runs/restricted-agent/PHASE-29C/smoke-blocked
```

Real provider mode is explicit:

```bash
pnpm run restricted-agent-dry-run -- --provider real --phase PHASE-29C --task task-001 --out runs/restricted-agent/PHASE-29C/smoke-real
```

Real mode uses the existing OpenAI-compatible provider configuration:

- `DUNGEON_FORGE_LLM_API_KEY` or `OPENAI_API_KEY`
- `DUNGEON_FORGE_LLM_BASE_URL`
- `DUNGEON_FORGE_LLM_MODEL`

If credentials are missing, the dry-run decision is `blocked` and no provider
network call is made.

Dry-run evidence files:

- `prompt-context.json`
- `raw-response.txt`
- `parsed-response.json`, only when strict JSON and schema validation pass
- `validation-diagnostics.json`
- `dry-run-decision.json`

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

## Patch Validation

PHASE-30A validates model-proposed patch intents before any file can be changed.
Validation is non-mutating: it reads target files, checks policy, and returns a
normalized patch plan only when every operation is safe.

Supported v1 patch kinds:

- `replace_exact`
- `insert_before_exact`
- `insert_after_exact`
- `create_file`

Hard blockers include:

- paths outside both phase and accepted-task allowed paths
- `.env`, credential, secret, private, generated-evidence, lockfile, or package
  manifest targets
- unsupported file extensions
- unknown operations, delete requests, rename requests, or malformed intents
- missing target files for edit operations
- existing target files for `create_file`
- expected text not found exactly once
- duplicate/ambiguous anchors
- max file, operation, per-replacement byte, or total byte budget violations
- secret-like replacement or created-file content

The normalized plan records path, kind, expected text when applicable,
replacement text, replacement byte length, and the budgets used for validation.
Later phases may apply only a validated plan; they must not reinterpret raw model
text.

## Patch Application

PHASE-30B applies only a normalized validated plan produced by the PHASE-30A
validator. The applier does not accept raw model responses, raw patch intents,
shell strings, git commands, package changes, dependency changes, generated
evidence mutations, commits, pull requests, merges, or arbitrary filesystem
writes.

Dry-run is the default mode. It computes the same intended after-content,
hashes, byte counts, operation summaries, file summaries, and diagnostics that
apply mode would report, but it does not create, edit, truncate, or delete target
files.

Apply mode is still bounded to the supplied worktree and precomputes the entire
patch set before mutating any target file. If any exact anchor is missing,
ambiguous, or otherwise cannot be applied, the whole plan is blocked and target
files are left unchanged.

For changed existing files, apply mode writes rollback copies under the supplied
evidence directory before target-file writes. Created files are reported as
creation evidence with `beforeSha256: null`; PHASE-30B does not introduce an
automatic rollback command that mutates files after the fact.

Patch reports include:

- mode and status
- diagnostics
- operation summaries
- per-file changed flags
- before/after SHA-256 hashes
- before/after byte counts
- rollback paths for changed existing files

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
and focused tests. PHASE-29B adds deterministic context packaging, read ranges,
allowed-path search, and exposure evidence. PHASE-29C adds the credential-gated,
non-mutating dry-run API loop. PHASE-30A adds conservative source patch
validation. PHASE-30B adds deterministic application of normalized validated
patch plans with dry-run previews and rollback evidence. Later phases will add
whitelisted checks and optional autopilot delegate integration.
