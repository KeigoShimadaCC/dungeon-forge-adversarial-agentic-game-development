#!/usr/bin/env node
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const phase = args.get('--phase') ?? 'PHASE-01A';
const report = {
  schemaVersion: 1,
  phase,
  status: 'pass',
  summary: 'Fake planner accepted the deterministic starter phase.',
  tasks: [
    {
      id: 'task-001',
      title: 'Write fake supervised output',
      description: 'Create a small docs artifact so the runner can collect deterministic changed-path evidence.',
      allowedPaths: ['docs/**', 'README.md', 'PROGRESS.md'],
      acceptanceCriteriaCovered: [
        'AC-1: Project skeleton exists.',
        'AC-2: Validation commands are configured or explicitly documented as unavailable.',
        'AC-3: README or docs describe the local workflow.',
        'AC-4: Tests, build, or typecheck are available or their absence is documented.',
        'AC-5: PROGRESS.md is updated.',
      ],
      cursorDelegation: {
        recommended: false,
        reason: 'Fake test path does not require delegated subtasks.',
      },
    },
  ],
  requiredFocusedTests: ['git diff --check'],
  requiredSmokeCommands: ['git diff --check'],
  requiredArtifacts: ['docs/fake-agent-output.md'],
  risks: [],
  questions: [],
  planAcceptanceRecommendation: 'accept',
};

process.stdout.write(`Fake planner report\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
