# Security Audit

Date: 2026-05-24

Scope: whole repository on branch `security-audit-remediation`. Framework basis: OWASP ASVS 5.0.0 application controls, OWASP LLM Top 10 2025 for optional LLM paths, and OWASP Agentic AI threat guidance for phase-autopilot and delegated-agent tooling.

## Threat Model

Primary assets:

- Local repository integrity, phase plans, automation state, and generated evidence under `runs/**`.
- Developer machine credentials and environment variables used by optional GitHub, Cursor, Codex, and LLM workflows.
- Deterministic game and harness invariants: finite text/ASCII gameplay, seed reproducibility, structured actions, explicit terminal states, and trace-backed review evidence.

Trust boundaries:

- CLI arguments and JSON/content files enter repo tooling from local operators or generated artifacts.
- Phase autopilot can execute shell/agent/git/GitHub commands only behind explicit safety flags.
- Cursor/Codex/LLM outputs are advisory and must be parsed, validated, and prevented from mutating game state directly.
- Static dashboard/demo HTML renders local evidence artifacts and must not turn malformed evidence paths into active links.
- Optional media metadata must remain additive and must not require files or probe arbitrary filesystem locations.

Out of scope:

- Browser-hosted multi-user service risks; this repo currently ships local CLI/static artifacts, not an authenticated web service.
- Live provider behavior without user-supplied credentials.

## Coverage Ledger

| Area | Evidence | Disposition |
| --- | --- | --- |
| CLI entrypoints | `package.json`, `src/harness/*-cli.ts`, `src/human-play/*cli.ts` | Reviewed; no auth/session surface. |
| Command execution | `src/harness/command-executor.ts`, `git-adapter.ts`, `github-cli-adapter.ts`, `agent-adapters.ts` | Reportable Medium; fixed. |
| Git/GitHub automation | `src/harness/git-adapter.ts`, `github-cli-adapter.ts`, `phase-autopilot.ts` | Reportable Medium through shell-boundary risk; fixed with argv for internal commands. |
| Cursor/agent prompts | `automation/prompts/**`, `src/harness/agent-adapters.ts` | Explicit shell templates remain by design for configured automation; documented residual risk. |
| LLM provider path | `llm-provider-config.ts`, `llm-provider.ts`, player/reviewer parsers | Reportable Medium; base URL validation fixed. Output parsing already falls back on malformed JSON. |
| JSON/content loaders | `src/game/**`, `src/harness/*packs*`, tests | Reviewed; typed validators constrain game/content semantics. No high-impact issue found. |
| Artifact/report outputs | dashboard/static demo renderers, artifact loaders | Reportable Medium; unsafe href rendering fixed. Artifact read path traversal control already present. |
| Optional media filesystem checks | `src/harness/optional-media.ts` | Reportable Medium; unsafe asset probes fixed. |
| Secrets | `.gitignore`, `.env.example`, `secret-scan.ts`, PHASE-22A changes | Reviewed; current scan blocks `.env*`, credential-like paths, and common token patterns. |
| Dependency supply chain | `pnpm-lock.yaml`, `package.json`, GitHub Actions | Audit commands planned in validation section. |

## Findings And Fixes

### Medium: Internal automation commands used shell strings where argv was sufficient

Mapping: ASVS 5.0.0 V5 input validation / V14 configuration; Agentic AI threat guidance for tool invocation and delegated-agent boundaries; CWE-78.

Affected files:

- `src/harness/command-executor.ts`
- `src/harness/git-adapter.ts`
- `src/harness/github-cli-adapter.ts`

Validation:

- Before the fix, internal Git/GitHub wrappers assembled commands as shell strings such as `git diff <baseRef>` and `gh pr create ... <branch>`.
- The most realistic attacker is a malformed generated automation value or branch/ref/path reaching an internal command wrapper during an allowed autopilot run.
- Regression coverage now proves argv metacharacters are passed literally and Git refs are passed as argv, not shell templates.

Fix:

- Added `args?: string[]` to the command executor. When `args` is present, `spawn` defaults to `shell: false`.
- Migrated internal Git and GitHub adapter calls to executable plus argv.
- Preserved configured `commandTemplate` shell execution for explicit automation config and agent commands.

Status: fixed.

### Medium: Optional media file checks could probe unsafe metadata paths

Mapping: ASVS 5.0.0 V12 file/resource handling; CWE-22.

Affected file:

- `src/harness/optional-media.ts`

Validation:

- Optional media diagnostics rejected absolute, parent-relative, and remote asset paths, but file checks still resolved and probed the supplied path.
- The impact is local information/probe behavior in tooling, not remote file read, because this is a local CLI path and the result only reports present/missing.

Fix:

- Added safe resolution that returns `missing` for invalid paths and only probes resolved paths under repo-local `media/`.
- Added tests for unsafe parent-relative paths and safe present `media/` assets.

Status: fixed.

### Medium: Generated HTML artifact links did not block active or escaping href values

Mapping: ASVS 5.0.0 V5 output encoding / V12 resource handling; CWE-79/CWE-601 adjacent local artifact link risk.

Affected files:

- `src/dashboard/render-html.ts`
- `src/static-demo/render-html.ts`

Validation:

- Text was HTML-escaped, but an evidence artifact path such as `javascript:...` or `../outside.json` could still become an `href`.
- The artifact is local/static, but malformed generated evidence can be opened by a reviewer in a browser, so active links should be blocked.

Fix:

- Added artifact href checks that reject absolute paths, protocol URLs, protocol-relative URLs, and `..` path segments.
- Unsafe artifact links render as `#blocked-artifact-link`.
- Added dashboard and static-demo regression tests.

Status: fixed.

### Medium: LLM base URL override accepted unsafe endpoint forms

Mapping: OWASP LLM Top 10 2025 LLM07 insecure plugin/tool design and LLM02 sensitive information disclosure; ASVS 5.0.0 V14 configuration; CWE-918 adjacent egress-control risk.

Affected file:

- `src/harness/llm-provider-config.ts`

Validation:

- Real LLM runs are credential-gated, but a configured base URL controls where API keys are sent.
- Non-loopback `http`, embedded credentials, query strings, fragments, and non-HTTP(S) schemes are not needed for the documented OpenAI-compatible use case.

Fix:

- Base URL validation now requires HTTP(S), rejects credentials/query/fragment, requires HTTPS except for `localhost`, `127.0.0.1`, and `::1`, and normalizes trailing slashes.
- Added tests for metadata-service-style HTTP rejection, localhost HTTP allowance, and credentialed URL rejection.

Status: fixed.

## Suppressed Or Low-Risk Notes

- Explicit `commandTemplate` shell strings remain supported in `automation/autopilot-config.json` and `agent-adapters.ts`. This is intentional because the automation config is an operator-controlled command template. Mitigation is explicit `allowAgentExecution`, manual mode defaults, prompt guidance not to include secrets, and argv migration for internal Git/GitHub wrappers.
- The repo has no server-side auth/session layer, database, or deployed request router. ASVS authentication, session, access-control, and API tenant-boundary controls are not applicable to the current local CLI/static-artifact product shape.
- Static HTML output is local generated evidence, not a hosted multi-user application. The active-link fix still removes the credible reviewer-browser footgun.

## Validation Commands

Completed during remediation:

```bash
pnpm test tests/phase-autopilot.test.ts tests/optional-media.test.ts tests/version-dashboard.test.ts tests/static-demo.test.ts
pnpm test tests/phase-autopilot.test.ts tests/optional-media.test.ts tests/version-dashboard.test.ts tests/static-demo.test.ts tests/llm-provider.test.ts
pnpm run typecheck
pnpm run lint
pnpm audit --prod
pnpm audit
pnpm test
pnpm run build
pnpm run check
git diff --check
```

Audit result: `pnpm audit --prod` and `pnpm audit` both reported no known vulnerabilities on the escalated network rerun. The first sandboxed attempts failed with DNS `ENOTFOUND` for `registry.npmjs.org`; those failures were environment/network blockers, not dependency findings.

## Residual Risks

- Live `pnpm audit` results are time-sensitive; this report records the result observed on 2026-05-24.
- Any future automation setting that introduces user-controlled `commandTemplate` values should be treated as a separate high-risk design change.
- If static dashboard/demo output is later hosted publicly, add a browser-oriented review for CSP, MIME type, and hosting controls.
