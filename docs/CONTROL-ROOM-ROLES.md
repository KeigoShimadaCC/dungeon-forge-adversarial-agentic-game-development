# Control Room Roles

PHASE-25B adds a local role catalog for future control-room screens and prepared handoffs. It is **display metadata only**: importing the catalog must not launch agents, call providers, resolve credentials, mutate game state, or run harness commands.

## Purpose

A future control room needs to answer three questions before orchestrating work:

1. **Who is speaking?** — stable actor identity and display labels for timeline or chat UI.
2. **What persona or prompt applies?** — safe, inspectable metadata without copying hidden runtime text.
3. **Which model path is intended?** — advisory labels for later handoffs, not live provider configuration.

The catalog in `src/control-room/roles/` satisfies those questions locally and deterministically.

## API Surface

Import from `src/control-room/roles/index.ts`:

| Export | Use |
| --- | --- |
| `buildControlRoomRoleCatalog()` | Full catalog object (`schemaVersion`, `roles`). |
| `listControlRoomRoles()` | Shallow-copied role entries for UI listing. |
| `getControlRoomRole(id)` | Lookup one actor by stable id. |
| `listControlRoomReviewerPersonas()` | Selectable reviewer persona metadata. |
| `getControlRoomReviewerPersona(id)` | Lookup one reviewer persona. |
| `assertCompleteControlRoomRoleCatalog(catalog)` | Guard that all required actors exist. |
| `stringifyControlRoomRoleCatalog(catalog?)` | Deterministic JSON for fixtures and snapshots. |

Types and constants (`ControlRoomRoleKind`, `CONTROL_ROOM_ACTOR_IDS`, prompt visibility levels, etc.) live in `src/control-room/roles/types.ts`.

## Actors and Role Kinds

Each catalog entry has a stable **actor id** (`id`) for storage and a **role kind** (`roleKind`) for UI grouping. Future UI code should use `roleKind` to group speakers, not infer semantics from display text alone.

| Actor id | Display name | Role kind | Speaker type |
| --- | --- | --- | --- |
| `game_developer` | Game Developer | `developer_ai` | AI agent (bounded coding) |
| `game_reviewer` | Game Reviewer | `reviewer_ai` | AI agent (trace-backed critique) |
| `narrator` | Narrator | `narrator_ai` | AI agent (summary/synthesis, metadata only in this phase) |
| `human` | Human | `human` | Human operator |

### Human vs AI display semantics

- **AI roles** (`developer_ai`, `reviewer_ai`, `narrator_ai`) represent agents that may later run through prepared handoffs. In PHASE-25B they expose metadata only; no agent is started when the catalog is built or imported.
- **Human** (`human`) represents the operator: ideas, comments, approvals, and base-version choices. Human entries never select a model or persona from the catalog.
- **Display names** are human-readable labels for UI chrome. **Actor ids** and **role kinds** are the canonical keys for persistence, filtering, and timeline attribution.
- When showing "who is speaking," prefer `displayName` for visible text and `id` / `roleKind` for logic. Do not parse display strings back into roles.

## Reviewer Persona Selection

Reviewer persona options are projected from existing harness reviewer metadata (`src/harness/reviewer-personas.js`), not duplicated or invented in the control-room layer:

| Persona id | Purpose |
| --- | --- |
| `careful_player` | Default persona; evidence-grounded, conservative play and critique. |
| `naive_player` | Less strategic player behavior for coverage diversity. |
| `bug_hunter` | Emphasis on defects, edge cases, and trace inconsistencies. |

Each persona record includes:

- `id`, `displayName`, `description`
- `emphasis` — short tags describing review focus
- `playerPolicyHint` — how the persona influences player/reviewer policy when selected
- `selectable: true`

The game reviewer role sets `defaultPersonaId: 'careful_player'`. Developer and narrator roles intentionally expose **no** runnable persona choices in this phase; they carry role descriptions and prompt references instead.

To list personas for a selection UI:

```typescript
import { listControlRoomReviewerPersonas } from '../src/control-room/roles/index.js';

const options = listControlRoomReviewerPersonas();
```

## Prompt Visibility

Prompt visibility is conservative. Each role exposes zero or more `prompts` entries with a **level**, **label**, **description**, **sourceReferences**, and **diagnostics**.

| Level | Meaning | Consumer action |
| --- | --- | --- |
| `safe_text` | Short text safe to show inline (reserved; no catalog entry uses this yet). | May render `safeToDisplayText` when present. |
| `safe_repo_reference` | Points at a repo file that can be inspected deliberately. | Load the referenced path on user action; do not auto-fetch in headless catalog builds. |
| `dynamic_runtime_reference` | Prompt text is assembled at runtime from state and artifacts. | Show builder name and input description; do not copy assembled prompt text into catalog output. |
| `not_applicable` | No system prompt applies (e.g. human actor). | Omit prompt preview UI or show the description only. |

### Source reference kinds

| Kind | Typical use |
| --- | --- |
| `repo_markdown` | Static prompt files under `src/agents/prompts/` or phase plans. |
| `typescript_builder` | Functions such as `buildLlmReviewerPrompt` that assemble prompts from traces, scorecards, renders, and selected personas. |
| `human_input` | Human-authored content with no system prompt. |

Runtime prompt builders may include renders, traces, scorecards, available actions, and selected personas. The catalog **does not serialize those runtime inputs** or copy hidden prompt bodies. Diagnostics explain when text is intentionally omitted.

### Per-role prompt summary

| Actor | Prompt entries |
| --- | --- |
| `game_developer` | `safe_repo_reference` → `src/agents/prompts/developer.md` |
| `game_reviewer` | `safe_repo_reference` → `src/agents/prompts/reviewer.md`; `dynamic_runtime_reference` → `buildLlmReviewerPrompt` in `src/agents/prompts/llm-reviewer.ts` |
| `narrator` | `safe_repo_reference` -> `phase-plans/PHASE-27B-NARRATED-VERSION-SUMMARIES.md` and deterministic narration docs |
| `human` | `not_applicable` |

## Model Metadata (Advisory Only)

Model choices describe intended execution paths for **later** handoff phases. They are not live provider configuration.

Every `modelChoices` entry includes:

| Field | Meaning |
| --- | --- |
| `advisoryOnly` | Always `true` — metadata for UI and handoff prep only. |
| `providerCallEnabled` | Always `false` — importing the catalog never starts a provider call. |
| `providerKind` | `local_deterministic`, `configured_llm_provider`, or `human`. |
| `modelLabel` | Human-readable default label (e.g. configured default model constant, not a resolved env value). |
| `credentialsRequiredForRealProvider` | Whether a real provider run would need credentials later (informational). |
| `configurableEnvVars` | Non-secret env var **names** only (e.g. `DUNGEON_FORGE_LLM_MODEL` for model selection). |
| `notes` | Plain-language guidance for operators and future integrators. |

### Model choices by role

| Actor | Choices | Default intent |
| --- | --- | --- |
| `game_developer` | Configured developer model | Optional LLM-backed developer handoff (later phase). |
| `game_reviewer` | Local deterministic harness; configured reviewer model | Credential-free deterministic review remains the default path. |
| `narrator` | Configured narrator model | Optional LLM narration (later phase). |
| `human` | Human input | No model; represents the operator. |

The catalog imports **constants** such as the default model label from harness config. It does **not** call `resolveLlmProviderConfig`, `hasLlmProviderCredentials`, or read `process.env` at catalog build time. Poisoned or secret environment values must never appear in serialized catalog output.

## Credential-Free Boundary

PHASE-25B preserves the existing guarantee that gameplay, harness commands, and deterministic tests run without API credentials:

- Catalog build and import are synchronous, local, and side-effect free.
- No API keys, base URLs with embedded credentials, or secret env var names appear in catalog artifacts.
- Model env var names exposed are limited to non-secret selectors (e.g. `DUNGEON_FORGE_LLM_MODEL`), not credential variables.
- Deterministic reviewer behavior (`local_deterministic`) requires no credentials and remains available as metadata on the game reviewer role.

Consumers must not use catalog metadata to bypass this boundary (e.g. by resolving credentials during catalog import). Later orchestration phases should treat model choices as preselection hints only.

## Out of Scope (This Phase)

This phase does **not** add:

- Browser UI or control-room screens
- Shared control-room barrel exports (import `src/control-room/roles/index.ts` directly until an integration phase adds a shared boundary)
- Orchestration, agent launch, or timeline artifact wiring
- Live LLM calls or provider health checks
- Runnable developer or narrator personas

Later phases (e.g. PHASE-26A timeline integration, PHASE-27B narrated summaries) should consume this catalog as read-only metadata when preparing handoffs and rendering speaker attribution.
