import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  evaluateAcceptanceGate,
  FORBIDDEN_MVP_FEATURES,
  renderAcceptanceMarkdown,
  writeAcceptanceReport,
} from '../src/harness/acceptance-gate.js';
import {
  ensureVersionFolder,
  getVersionPaths,
  runVersion,
  summarizeVersion,
} from '../src/harness/version-loop.js';
import type { PlaythroughScorecard } from '../src/harness/types.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-acceptance-gate-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

describe('Phase 11A acceptance gate', () => {
  it('generates a happy-path acceptance report with pending human decision', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(
        paths.changelogPath,
        '# Changelog\n\n- Added deterministic acceptance gate checks.\n',
        'utf8',
      );
      await writeFile(
        paths.developerNotesPath,
        '# Developer Notes\n\n- Reviewed risks and invariant preservation.\n',
        'utf8',
      );

      const result = await writeAcceptanceReport({
        runsRoot,
        onExisting: 'overwrite',
        version: 'v001',
        commandStatuses: {
          typecheck: 'pass',
          test: 'pass',
          lint: 'pass',
          build: 'pass',
        },
      });

      const markdown = await readFile(result.acceptancePath, 'utf8');
      expect(result.machine_recommendation).toBe('pass');
      expect(result.human_decision).toBe('pending');
      expect(markdown).toContain('Status: pending');
      expect(markdown).toContain('## Human decision');
      expect(markdown).toContain('do **not** auto-accept');
      expect(markdown).toContain('Forbidden MVP feature checklist');
      expect(markdown).toContain(FORBIDDEN_MVP_FEATURES[0]);
      expect(result.checks.some((check) => check.status === 'pass')).toBe(true);

      const summary = await summarizeVersion(runsRoot, 'v001');
      expect(summary.acceptance_status).toBe('pending');
    });
  });

  it('reuses existing generated timestamp when regenerating a report', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(
        paths.changelogPath,
        '# Changelog\n\n- Added deterministic acceptance gate checks.\n',
        'utf8',
      );
      await writeFile(
        paths.developerNotesPath,
        '# Developer Notes\n\n- Reviewed risks and invariant preservation.\n',
        'utf8',
      );

      const first = await writeAcceptanceReport({
        runsRoot,
        onExisting: 'overwrite',
        version: 'v001',
        commandStatuses: {
          typecheck: 'pass',
          test: 'pass',
          lint: 'pass',
          build: 'pass',
        },
      });
      const second = await writeAcceptanceReport({
        runsRoot,
        onExisting: 'overwrite',
        version: 'v001',
        commandStatuses: {
          typecheck: 'skipped',
          test: 'skipped',
          lint: 'skipped',
          build: 'skipped',
        },
      });

      const markdown = await readFile(second.acceptancePath, 'utf8');
      expect(second.generatedAt).toBe(first.generatedAt);
      expect(markdown).toContain(`Generated: ${first.generatedAt}`);
      expect(markdown).toContain('| Tests | SKIPPED | Tests was intentionally skipped. |');
    });
  });

  it('fails when required commands report failure', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.changelogPath, '# Changelog\n\n- Implemented feature X.\n', 'utf8');
      await writeFile(paths.developerNotesPath, '# Developer Notes\n\n- Tests failed.\n', 'utf8');

      const result = await writeAcceptanceReport({
        runsRoot,
        onExisting: 'overwrite',
        version: 'v001',
        commandStatuses: {
          typecheck: 'pass',
          test: 'fail',
        },
      });

      expect(result.machine_recommendation).toBe('fail');
      expect(result.checks.find((check) => check.id === 'command_test')?.status).toBe('fail');
      expect(result.blockers.some((blocker) => blocker.includes('Tests'))).toBe(true);
      const summary = await summarizeVersion(runsRoot, 'v001');
      expect(summary.acceptance_status).toBe('rejected');
    });
  });

  it('blocks acceptance when typecheck or test evidence is not supplied', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.changelogPath, '# Changelog\n\n- Implemented feature X.\n', 'utf8');
      await writeFile(paths.developerNotesPath, '# Developer Notes\n\n- Command evidence missing.\n', 'utf8');

      const result = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
      });

      expect(result.machine_recommendation).toBe('blocked');
      expect(result.checks.find((check) => check.id === 'command_typecheck')?.status).toBe(
        'blocked',
      );
      expect(result.checks.find((check) => check.id === 'command_test')?.status).toBe('blocked');
    });
  });

  it('rejects missing or placeholder changelog content', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.developerNotesPath, '# Developer Notes\n\n- Changelog missing.\n', 'utf8');

      const missing = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
        commandStatuses: { typecheck: 'pass', test: 'pass' },
      });
      expect(missing.checks.find((check) => check.id === 'changelog_present')?.status).toBe('fail');
      expect(missing.blockers.some((blocker) => blocker.includes('changelog.md'))).toBe(true);

      await writeFile(paths.changelogPath, '# Changelog\n\nStatus: pending\n', 'utf8');
      const placeholder = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
        commandStatuses: { typecheck: 'pass', test: 'pass' },
      });
      expect(placeholder.checks.find((check) => check.id === 'changelog_present')?.status).toBe('fail');
    });
  });

  it('rejects missing or placeholder developer notes', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.changelogPath, '# Changelog\n\n- Implemented feature X.\n', 'utf8');

      const missing = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
        commandStatuses: { typecheck: 'pass', test: 'pass' },
      });
      expect(missing.checks.find((check) => check.id === 'developer_notes_present')?.status).toBe(
        'fail',
      );
      expect(missing.blockers.some((blocker) => blocker.includes('developer_notes.md'))).toBe(
        true,
      );

      await writeFile(paths.developerNotesPath, '# Developer Notes\n\nStatus: pending\n', 'utf8');
      const placeholder = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
        commandStatuses: { typecheck: 'pass', test: 'pass' },
      });
      expect(
        placeholder.checks.find((check) => check.id === 'developer_notes_present')?.status,
      ).toBe('fail');
    });
  });

  it('blocks reviewer-driven versions without patch plan or developer task', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.changelogPath, '# Changelog\n\n- Reviewer requested changes.\n', 'utf8');
      await writeFile(paths.developerNotesPath, '# Developer Notes\n\n- Reviewer handoff missing.\n', 'utf8');

      const result = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
        reviewerDriven: true,
        commandStatuses: { typecheck: 'pass', test: 'pass' },
      });

      expect(result.machine_recommendation).toBe('blocked');
      expect(result.checks.find((check) => check.id === 'reviewer_handoff')?.status).toBe('blocked');
    });
  });

  it('passes reviewer handoff when developer_task.md exists', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.changelogPath, '# Changelog\n\n- Implemented reviewer fixes.\n', 'utf8');
      await writeFile(paths.developerNotesPath, '# Developer Notes\n\n- Reviewer handoff present.\n', 'utf8');
      await writeFile(
        path.join(paths.versionDir, 'developer_task.md'),
        '# Developer Task\n\nTarget version v002.\n',
        'utf8',
      );

      const result = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
        reviewerDriven: true,
        commandStatuses: { typecheck: 'pass', test: 'pass' },
      });

      expect(result.checks.find((check) => check.id === 'reviewer_handoff')?.status).toBe('pass');
    });
  });

  it('flags invalid terminal states and missing trace/review/scorecard artifacts', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await ensureVersionFolder(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.changelogPath, '# Changelog\n\n- Invalid terminal fixture.\n', 'utf8');
      await writeFile(paths.developerNotesPath, '# Developer Notes\n\n- Invalid terminal fixture.\n', 'utf8');

      const activeScorecard: PlaythroughScorecard = {
        version: 'v001',
        seed: 'seed_001',
        persona: 'careful_player',
        result: 'ACTIVE',
        turns: 3,
        floors_reached: 1,
        damage_taken: 0,
        items_used: 0,
        enemies_defeated: 0,
        invalid_actions: 0,
        softlocks: 0,
        trace_path: 'runs/v001/traces/seed_001_careful_player.json',
        reviewer_scores: {
          fun: 1,
          clarity: 1,
          fairness: 1,
          tactical_depth: 1,
          replay_value: 1,
        },
      };
      await writeFile(
        path.join(paths.scorecardsDir, 'seed_001_careful_player.json'),
        `${JSON.stringify(activeScorecard, null, 2)}\n`,
        'utf8',
      );

      const invalidTerminal = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
        commandStatuses: { typecheck: 'pass', test: 'pass' },
      });
      expect(
        invalidTerminal.checks.find((check) => check.id === 'terminal_status_valid')?.status,
      ).toBe('fail');
      expect(invalidTerminal.checks.find((check) => check.id === 'traces_present')?.status).toBe(
        'fail',
      );
      expect(invalidTerminal.checks.find((check) => check.id === 'reviews_present')?.status).toBe(
        'fail',
      );
    });
  });

  it('renders forbidden checklist and all report statuses in markdown', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.changelogPath, '# Changelog\n\n- Stable release notes.\n', 'utf8');
      await writeFile(paths.developerNotesPath, '# Developer Notes\n\n- Stable release notes.\n', 'utf8');

      const result = await evaluateAcceptanceGate({
        runsRoot,
        version: 'v001',
        commandStatuses: {
          typecheck: 'blocked',
          test: 'skipped',
          lint: 'warning',
          build: 'pass',
        },
      });

      const markdown = renderAcceptanceMarkdown(result);
      expect(markdown).toMatch(/\| Typecheck \| BLOCKED \|/);
      expect(markdown).toMatch(/\| Tests \| SKIPPED \|/);
      expect(markdown).toMatch(/\| Lint \| WARNING \|/);
      expect(markdown).toContain('Real-time combat or timing-sensitive input.');
    });
  });

  it('infers blocked acceptance status from machine recommendation while human decision stays pending', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(paths.changelogPath, '# Changelog\n\n- Stable release notes.\n', 'utf8');
      await writeFile(paths.developerNotesPath, '# Developer Notes\n\n- Stable release notes.\n', 'utf8');

      await writeAcceptanceReport({
        runsRoot,
        onExisting: 'overwrite',
        version: 'v001',
        reviewerDriven: true,
        commandStatuses: { typecheck: 'pass', test: 'pass' },
      });

      const summary = await summarizeVersion(runsRoot, 'v001');
      expect(summary.acceptance_status).toBe('blocked');
    });
  });
});
