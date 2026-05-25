import { access } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';
import type { RepoProfile } from './repo-profiler.js';
import type { PlannedFile } from './file-plan.js';
import type { AutomergePolicy, PhaseGraph, PhaseState } from './phase-runner.js';

export interface StarterPhasePlanInput {
  repoRoot: string;
  idea: string;
  profile?: RepoProfile;
  now?: Date;
}

export interface StarterPhasePlan {
  schemaVersion: 1;
  idea: string;
  planQuality: PlanQuality;
  proposedFiles: PlannedFile[];
}

export interface PlanQuality {
  kind: 'deterministic-starter';
  confidence: 'medium';
  requiresHumanReview: true;
  limitations: string[];
}

export const PLAN_QUALITY: PlanQuality = {
  kind: 'deterministic-starter',
  confidence: 'medium',
  requiresHumanReview: true,
  limitations: [
    'Does not call an LLM.',
    'Does not deeply inspect source semantics.',
    'Starter phases should be edited before high-autonomy execution.',
  ],
};

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

const pushUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) values.push(value);
};

const markdownList = (items: string[]): string =>
  items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- None yet.';

const validationCommands = (profile: RepoProfile | undefined): string[] => {
  const commands = [...(profile?.recommendedConfig.globalValidationCommands ?? [])];
  if (commands.length === 0) commands.push('git diff --check');
  if (!commands.includes('git diff --check')) commands.push('git diff --check');
  return commands;
};

const defaultAllowedPaths = (profile: RepoProfile | undefined): string[] => {
  const allowed = [...(profile?.recommendedConfig.defaultAllowedPaths ?? [])];
  for (const fallback of ['src/**', 'tests/**', 'docs/**', 'README.md', 'package.json', 'tsconfig.json', 'PROGRESS.md']) {
    pushUnique(allowed, fallback);
  }
  return allowed;
};

const coreAllowedPaths = (profile: RepoProfile | undefined): string[] => {
  const allowed: string[] = [];
  const sourceDirs = profile?.sourceDirectories.length ? profile.sourceDirectories : ['src'];
  const testDirs = profile?.testDirectories.length ? profile.testDirectories : ['tests'];
  const docsDirs = profile?.docsDirectories.length ? profile.docsDirectories : ['docs'];
  for (const dir of sourceDirs) pushUnique(allowed, `${dir}/**`);
  for (const dir of testDirs) pushUnique(allowed, `${dir}/**`);
  for (const dir of docsDirs) pushUnique(allowed, `${dir}/**`);
  pushUnique(allowed, 'PROGRESS.md');
  return allowed;
};

const forbiddenPaths = (profile: RepoProfile | undefined): string[] =>
  profile?.recommendedConfig.defaultForbiddenPaths ?? [
    '.env',
    '.env.*',
    'node_modules/**',
    'dist/**',
    'build/**',
  ];

const stackNotes = (profile: RepoProfile | undefined): string[] => {
  const notes: string[] = [];
  if (profile?.frameworks.includes('nextjs')) {
    notes.push('Preserve app/router or pages/router conventions.');
    notes.push('Validate with build/typecheck if available.');
    notes.push('Avoid changing deployment config unless phase explicitly allows it.');
  }
  if (profile?.languages.includes('python') || profile?.frameworks.includes('fastapi')) {
    notes.push('Preserve API route contracts.');
    notes.push('Prefer pytest if configured.');
    notes.push('Avoid changing virtualenv or generated caches.');
  }
  if (profile?.languages.includes('typescript')) {
    notes.push('Preserve strict typecheck behavior where configured.');
    notes.push('Prefer small typed modules and focused tests.');
  }
  return notes;
};

const conceptNorthStar = (idea: string): string => `# North Star And Vision

## Product Intent

${idea}

## North Star

Create a local-first product that can be improved through small, phase-scoped changes with deterministic validation before any release action.

## Success Criteria

- The core user workflow is clear enough to implement in incremental phases.
- Each phase has explicit allowed paths, acceptance criteria, and validation commands.
- Generated evidence can explain what changed, what was checked, and what remains blocked.

## Non-Goals

- Full autonomous planning without human review.
- Secret handling or credential collection.
- Merging work without deterministic gates.
`;

const conceptStructure = (idea: string, profile: RepoProfile | undefined): string => `# Structure And Tech Specs

## Idea

${idea}

## Detected Repo Shape

- Package manager: ${profile?.packageManager ?? 'unknown'}
- Languages: ${(profile?.languages.length ? profile.languages : ['unknown']).join(', ')}
- Frameworks: ${(profile?.frameworks.length ? profile.frameworks : ['none detected']).join(', ')}
- Source directories: ${(profile?.sourceDirectories.length ? profile.sourceDirectories : ['src']).join(', ')}
- Test directories: ${(profile?.testDirectories.length ? profile.testDirectories : ['tests']).join(', ')}

## Initial Technical Direction

- Keep the first implementation slice small and easy to validate.
- Prefer existing repo conventions over new infrastructure.
- Add or document validation commands before claiming a phase complete.
- Keep generated evidence and local run artifacts out of product source.
`;

const conceptWorkflows = (idea: string): string => `# Examples Scenarios And Workflows

## Idea

${idea}

## Starter Workflow

1. User opens the project locally.
2. User completes the smallest meaningful product workflow.
3. Validation proves the workflow still works after each phase.
4. Known gaps are recorded in PROGRESS.md instead of hidden.

## Agentic Workflow

1. Run doctor and onboard.
2. Review generated concept docs and phase plans.
3. Run a dry-run phase bundle.
4. Execute one supervised phase at a time.
5. Merge only when deterministic gates pass.
`;

const phaseStandards = (commands: string[]): string => `# PHASE-00A - Plan Standards And Global Invariants

## Goal

Define the operating rules that every generated phase must preserve.

## Scope

- Phase plans must stay small, explicit, and verifiable.
- Every phase must list allowed paths, forbidden paths, acceptance criteria, and required validation.
- PROGRESS.md must reflect active work, validation, blockers, and deferred backlog.

## Allowed Paths

- concept-and-ideas/**
- phase-plans/**
- automation/**
- PROGRESS.md

## Forbidden Paths

- .env
- .env.*
- node_modules/**
- dist/**
- build/**
- runs/**

## Tasks

- Keep phase scope explicit.
- Keep validation commands current.
- Keep generated evidence out of source review unless explicitly needed.

## Acceptance Criteria

- Every executable phase has clear allowed paths.
- Every executable phase has deterministic acceptance criteria.
- Every executable phase has required validation commands.

## Required Validation

${markdownList(commands)}

## Risks

- Over-broad phases can hide unrelated changes.
- Missing validation can make agent output look more complete than it is.

## Out of Scope

- Product implementation.
- Full autonomous planning.
`;

const phasePlan = (input: {
  id: string;
  title: string;
  goal: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  stackNotes: string[];
  tasks: string[];
  acceptance: string[];
  commands: string[];
  risks: string[];
  outOfScope: string[];
}): string => `# ${input.id} - ${input.title}

## Goal

${input.goal}

## Scope

- Implement only this phase.
- Keep changes inside the allowed paths.
- Update PROGRESS.md with tasks, validation, and known gaps.

## Allowed Paths

${markdownList(input.allowedPaths)}

## Forbidden Paths

${markdownList(input.forbiddenPaths)}

## Stack Notes

${markdownList(input.stackNotes)}

## Tasks

${markdownList(input.tasks)}

## Acceptance Criteria

${markdownList(input.acceptance)}

## Required Validation

${markdownList(input.commands)}

## Risks

${markdownList(input.risks)}

## Out of Scope

${markdownList(input.outOfScope)}
`;

const graphForStarterPlan = (commands: string[], foundationAllowedPaths: string[], corePaths: string[]): PhaseGraph => ({
  schemaVersion: 1,
  defaultStartPhase: 'PHASE-01A',
  defaultParallelism: 1,
  globalValidationCommands: commands,
  phases: [
    {
      id: 'PHASE-01A',
      plan: 'phase-plans/PHASE-01A-PROJECT-FOUNDATION.md',
      dependsOn: [],
      allowedPaths: foundationAllowedPaths,
      parallelGroup: 'default',
      automerge: false,
    },
    {
      id: 'PHASE-01B',
      plan: 'phase-plans/PHASE-01B-CORE-IMPLEMENTATION.md',
      dependsOn: ['PHASE-01A'],
      allowedPaths: corePaths,
      parallelGroup: 'default',
      automerge: false,
    },
    {
      id: 'PHASE-01C',
      plan: 'phase-plans/PHASE-01C-VALIDATION-AND-HARDENING.md',
      dependsOn: ['PHASE-01B'],
      allowedPaths: [...corePaths.filter((entry) => entry !== 'PROGRESS.md'), 'README.md', 'PROGRESS.md'],
      parallelGroup: 'default',
      automerge: false,
    },
  ],
});

const stateForStarterPlan = (date: string): PhaseState => ({
  schemaVersion: 1,
  lastUpdated: date,
  sourceNote: 'Generated by deterministic agentic plan --idea starter planning.',
  currentPhase: 'PHASE-01A',
  phases: {
    'PHASE-01A': { status: 'queued' },
    'PHASE-01B': { status: 'queued' },
    'PHASE-01C': { status: 'queued' },
  },
});

const policyForStarterPlan = (commands: string[]): AutomergePolicy => ({
  schemaVersion: 1,
  enabled: false,
  mergeMethod: 'squash',
  deleteBranchAfterMerge: false,
  removeCleanWorktreeAfterMerge: false,
  allowNoRemoteChecksWhenLocalGatePasses: false,
  requiredLocalCommands: commands,
  requiredPreflight: ['git status --short --branch', 'active phase plan exists', 'PROGRESS.md read'],
  requiredArtifacts: [
    'planner report',
    'accepted plan',
    'executor report',
    'recheck report',
    'local validation result',
    'phase merge evidence',
  ],
  blockMergeWhen: [
    'local validation fails',
    'remote PR checks fail',
    'phase acceptance criteria are incomplete',
    'recheck reports blocking gaps',
    'diff includes .env or credentials',
    'diff touches paths outside the phase allowedPaths list',
    'worktree has uncommitted changes after commit',
  ],
  gapPolicy: {
    blocking: 'fix_before_merge_or_mark_blocked',
    non_blocking: 'append_to_PROGRESS_future_backlog_then_allow_merge_if_acceptance_passes',
    out_of_scope: 'append_to_PROGRESS_future_backlog_then_allow_merge',
  },
});

const defaultAutopilotConfig = (): Record<string, unknown> => ({
  schemaVersion: 1,
  git: {
    baseBranch: 'main',
    baseRef: 'origin/main',
  },
  preflightCommands: ['git status --short --branch'],
  agents: {
    planner: {
      provider: 'manual',
      commandTemplate: "codex exec \"$(cat '{{PROMPT_PATH}}')\"",
      timeoutMs: 1800000,
      inactivityTimeoutMs: 300000,
      maxRetries: 0,
    },
    executor: {
      provider: 'manual',
      commandTemplate: "codex exec \"$(cat '{{PROMPT_PATH}}')\"",
      timeoutMs: 1800000,
      inactivityTimeoutMs: 300000,
      maxRetries: 0,
    },
    rechecker: {
      provider: 'manual',
      commandTemplate: "codex exec \"$(cat '{{PROMPT_PATH}}')\"",
      timeoutMs: 900000,
      inactivityTimeoutMs: 300000,
      maxRetries: 0,
    },
    cursorSubtask: {
      provider: 'manual',
      commandTemplate: "agent --print --trust --workspace '{{WORKSPACE}}' \"$(cat '{{PROMPT_PATH}}')\"",
      timeoutMs: 900000,
      inactivityTimeoutMs: 180000,
      maxRetries: 0,
    },
  },
  dependencyBootstrapCommands: [],
  commandExecutor: {
    defaultTimeoutMs: 3600000,
    inactivityTimeoutMs: 300000,
    maxRetries: 0,
  },
  restrictedAgentDelegate: {
    enabled: false,
    providerMode: 'fake',
    maxAttempts: 1,
    commandIds: [],
    patchBudget: {
      maxFiles: 1,
      maxBytes: 2000,
    },
    evidenceDirName: 'restricted-agent-tasks',
  },
});

export const generateStarterPhasePlan = async (
  input: StarterPhasePlanInput,
): Promise<StarterPhasePlan> => {
  const idea = input.idea.trim();
  if (!idea) {
    throw new Error('--idea must not be empty');
  }

  const date = (input.now ?? new Date()).toISOString().slice(0, 10);
  const commands = validationCommands(input.profile);
  const foundationAllowedPaths = defaultAllowedPaths(input.profile);
  const corePaths = coreAllowedPaths(input.profile);
  const blockedPaths = forbiddenPaths(input.profile);
  const graph = graphForStarterPlan(commands, foundationAllowedPaths, corePaths);
  const state = stateForStarterPlan(date);
  const policy = policyForStarterPlan(commands);
  const notes = stackNotes(input.profile);

  const proposedFiles: PlannedFile[] = [
    {
      path: 'concept-and-ideas/01_NORTH_STAR_AND_VISION.md',
      action: 'create',
      contents: conceptNorthStar(idea),
    },
    {
      path: 'concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md',
      action: 'create',
      contents: conceptStructure(idea, input.profile),
    },
    {
      path: 'concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md',
      action: 'create',
      contents: conceptWorkflows(idea),
    },
    {
      path: 'phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md',
      action: 'create',
      contents: phaseStandards(commands),
    },
    {
      path: 'phase-plans/PHASE-01A-PROJECT-FOUNDATION.md',
      action: 'create',
      contents: phasePlan({
        id: 'PHASE-01A',
        title: 'Project Foundation',
        goal: 'Create or align repo structure, configs, validation scripts, docs, and the minimal product skeleton.',
        allowedPaths: foundationAllowedPaths,
        forbiddenPaths: blockedPaths,
        stackNotes: notes,
        tasks: [
          'Confirm the initial repo structure for the idea.',
          'Add or align minimal skeleton files needed for the first product slice.',
          'Configure or document validation commands.',
          'Update README.md or docs with local usage.',
          'Update PROGRESS.md with completed work and known gaps.',
        ],
        acceptance: [
          'Project skeleton exists.',
          'Validation commands are configured or explicitly documented as unavailable.',
          'README or docs describe the local workflow.',
          'Tests, build, or typecheck are available or their absence is documented.',
          'PROGRESS.md is updated.',
        ],
        commands,
        risks: ['Validation commands may need manual setup before the first implementation phase.'],
        outOfScope: ['Full product implementation.', 'Autonomous merging or PR automation.'],
      }),
    },
    {
      path: 'phase-plans/PHASE-01B-CORE-IMPLEMENTATION.md',
      action: 'create',
      contents: phasePlan({
        id: 'PHASE-01B',
        title: 'Core Implementation',
        goal: 'Implement the first meaningful product slice from the idea.',
        allowedPaths: corePaths,
        forbiddenPaths: blockedPaths,
        stackNotes: notes,
        tasks: [
          'Implement the smallest useful end-to-end behavior.',
          'Add focused tests or smoke checks for the new behavior.',
          'Keep changes within the phase allowed paths.',
          'Update PROGRESS.md with validation and deferred gaps.',
        ],
        acceptance: [
          'Core behavior is implemented.',
          'Tests or smoke checks are added.',
          'No secrets are introduced.',
          'Phase acceptance checklist is complete.',
        ],
        commands,
        risks: ['The first product slice may need to be narrowed if validation becomes too broad.'],
        outOfScope: ['Large refactors.', 'Production deployment.', 'Unreviewed autonomous planning.'],
      }),
    },
    {
      path: 'phase-plans/PHASE-01C-VALIDATION-AND-HARDENING.md',
      action: 'create',
      contents: phasePlan({
        id: 'PHASE-01C',
        title: 'Validation And Hardening',
        goal: 'Run validations, improve error handling, docs, smoke tests, and package readiness.',
        allowedPaths: graph.phases[2]?.allowedPaths ?? corePaths,
        forbiddenPaths: blockedPaths,
        stackNotes: notes,
        tasks: [
          'Run the configured validation commands.',
          'Improve error handling around the core workflow.',
          'Tighten docs and smoke tests.',
          'Record known gaps in PROGRESS.md.',
        ],
        acceptance: [
          'Validation passes.',
          'Docs explain usage.',
          'Known gaps are recorded.',
          'No blocking recheck gaps remain.',
        ],
        commands,
        risks: ['Hardening can expand beyond the first product slice if scope is not kept tight.'],
        outOfScope: ['New major product features.', 'Bypassing deterministic gates.'],
      }),
    },
    {
      path: 'automation/phase-graph.json',
      action: 'create',
      contents: stringifyDeterministicJson(graph),
    },
    {
      path: 'automation/phase-state.json',
      action: 'create',
      contents: stringifyDeterministicJson(state),
    },
    {
      path: 'automation/policies/automerge-policy.json',
      action: 'create',
      contents: stringifyDeterministicJson(policy),
    },
  ];

  if (!(await exists(path.join(input.repoRoot, 'automation', 'autopilot-config.json')))) {
    proposedFiles.push({
      path: 'automation/autopilot-config.json',
      action: 'create',
      contents: stringifyDeterministicJson(defaultAutopilotConfig()),
    });
  }

  return {
    schemaVersion: 1,
    idea,
    planQuality: PLAN_QUALITY,
    proposedFiles,
  };
};

export const buildPlanSummaryMarkdown = (
  plan: StarterPhasePlan,
  profile?: RepoProfile,
): string => {
  const phaseFiles = plan.proposedFiles
    .map((file) => file.path)
    .filter((filePath) => filePath.startsWith('phase-plans/PHASE-01'));
  const commands = validationCommands(profile);

  return [
    '# Agentic Starter Plan Summary',
    '',
    '## Idea',
    '',
    plan.idea,
    '',
    '## Plan Quality',
    '',
    `- Kind: ${plan.planQuality.kind}`,
    `- Confidence: ${plan.planQuality.confidence}`,
    `- Requires human review: ${plan.planQuality.requiresHumanReview}`,
    '',
    '## Detected Stack',
    '',
    `- Package manager: ${profile?.packageManager ?? 'unknown'}`,
    `- Languages: ${(profile?.languages.length ? profile.languages : ['unknown']).join(', ')}`,
    `- Frameworks: ${(profile?.frameworks.length ? profile.frameworks : ['none detected']).join(', ')}`,
    '',
    '## Generated Phases',
    '',
    ...phaseFiles.map((filePath) => `- ${filePath}`),
    '',
    '## Validation Commands',
    '',
    ...commands.map((command) => `- ${command}`),
    '',
    '## Next Commands',
    '',
    '- agentic doctor --repo-root .',
    '- agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run',
    '- agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell',
    '',
    '## Limitations',
    '',
    ...plan.planQuality.limitations.map((limitation) => `- ${limitation}`),
    '',
  ].join('\n');
};
