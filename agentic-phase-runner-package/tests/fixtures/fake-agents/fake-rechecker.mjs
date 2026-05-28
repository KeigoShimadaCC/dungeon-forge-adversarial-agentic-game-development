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
  phaseAcceptanceComplete: true,
  filesChangedDuringRecheck: [],
  commandsRun: [{ command: 'git diff --check', status: 'pass' }],
  gaps: [],
  blockingGaps: [],
};

process.stdout.write(`Fake rechecker PASS\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
