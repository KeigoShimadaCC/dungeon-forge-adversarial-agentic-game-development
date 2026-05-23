import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildDashboardIndex,
  loadArtifactPayload,
  renderDashboardHtml,
  runVersionDashboardCli,
} from '../src/dashboard/index.js';
import {
  ensureVersionFolder,
  persistVersionComparison,
  persistVersionSummary,
  type VersionRunSpec,
} from '../src/harness/version-loop.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';
import type { PlaythroughScorecard, PlaythroughTrace } from '../src/harness/types.js';

const VERSION_RUNS = [
  { seed: 'seed_001', persona: 'careful_player' },
  { seed: 'seed_002', persona: 'naive_player' },
  { seed: 'seed_003', persona: 'bug_hunter' },
] as const satisfies readonly VersionRunSpec[];

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-version-dashboard-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, stringifyDeterministicJson(value), 'utf8');
};

const seedVersionEvidence = async (
  runsRoot: string,
  version: string,
  options: { accepted?: boolean; winOffset?: number } = {},
): Promise<void> => {
  const { paths } = await ensureVersionFolder(runsRoot, version);
  const winOffset = options.winOffset ?? 0;

  for (const [index, spec] of VERSION_RUNS.entries()) {
    const result = index + winOffset < 2 ? 'WIN' : 'LOSS';
    const tracePath = `runs/${version}/traces/${spec.seed}_${spec.persona}.json`;
    const reviewPath = `runs/${version}/reviews/${spec.seed}_${spec.persona}.json`;
    const scorecardPath = `runs/${version}/scorecards/${spec.seed}_${spec.persona}.json`;
    const trace: PlaythroughTrace = {
      version,
      seed: spec.seed,
      persona: spec.persona,
      result,
      turns: 10 + index,
      player_kind: 'agent',
      agent_policy_class: 'baseline',
      steps: [],
    };
    const scorecard: PlaythroughScorecard = {
      version,
      seed: spec.seed,
      persona: spec.persona,
      player_kind: 'agent',
      agent_policy_class: 'baseline',
      result,
      turns: 10 + index,
      floors_reached: result === 'WIN' ? 2 : 1,
      damage_taken: index,
      items_used: index + 1,
      enemies_defeated: index,
      invalid_actions: index === 2 ? 1 : 0,
      softlocks: 0,
      reviewer_scores: {
        fun: 4 - index,
        clarity: 4,
        fairness: 3,
        tactical_depth: 3 + index,
        replay_value: 4,
      },
      trace_path: tracePath,
      review_path: reviewPath,
      review_id: `${spec.persona}:${spec.seed}`,
    };
    await writeJson(path.join(runsRoot, tracePath), trace);
    await writeJson(path.join(runsRoot, reviewPath), {
      persona: spec.persona,
      scores: scorecard.reviewer_scores,
      top_issues: [],
    });
    await writeJson(path.join(runsRoot, scorecardPath), scorecard);
  }

  await writeFile(
    paths.acceptancePath,
    options.accepted
      ? '# Acceptance\n\n## Human decision\n\nStatus: accepted\n'
      : '# Acceptance\n\nStatus: pending\n',
    'utf8',
  );
  await writeFile(paths.changelogPath, '# Changelog\n\n- Seed evidence.\n', 'utf8');
  await persistVersionSummary(runsRoot, version, VERSION_RUNS, {
    onExisting: 'overwrite',
  });
};

describe('Phase 18A version dashboard', () => {
  it('builds a read-only dashboard index with versions, leaderboard, artifact links, and comparisons', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersionEvidence(runsRoot, 'v001', { accepted: true });
      await seedVersionEvidence(runsRoot, 'v002', { winOffset: 1 });
      await persistVersionComparison(runsRoot, 'v001', 'v002', { onExisting: 'overwrite' });

      const index = await buildDashboardIndex(runsRoot);

      expect(index.readOnly).toBe(true);
      expect(index.versions.map((entry) => entry.version)).toEqual(['v001', 'v002']);
      expect(index.comparisons).toEqual([
        {
          baseVersion: 'v001',
          targetVersion: 'v002',
          jsonPath: 'runs/comparisons/v001_vs_v002.json',
          markdownPath: 'runs/comparisons/v001_vs_v002.md',
        },
      ]);
      expect(index.leaderboard[0]).toMatchObject({
        rank: 1,
        version: 'v001',
        acceptanceStatus: 'accepted',
        summaryPath: 'runs/v001/version_summary.json',
        acceptancePath: 'runs/v001/acceptance.md',
      });
      expect(index.versions[0]?.artifacts.some((artifact) => artifact.kind === 'trace')).toBe(true);
      expect(index.versions[0]?.artifacts).toContainEqual({
        kind: 'json',
        label: 'balance_summary.json',
        relativePath: 'runs/v001/balance_summary.json',
        present: false,
      });
      expect(index.versions[0]?.missingArtifactCount).toBe(1);
    });
  });

  it('keeps missing artifact states visible for partial version folders', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await ensureVersionFolder(runsRoot, 'v001');

      const index = await buildDashboardIndex(runsRoot);

      expect(index.versions).toHaveLength(1);
      expect(index.versions[0]?.summary.status).toBe('partial');
      expect(index.versions[0]?.missingArtifactCount).toBeGreaterThan(0);
      expect(index.versions[0]?.artifacts.some((artifact) => !artifact.present)).toBe(true);
    });
  });

  it('renders leaderboard, version details, and links to persisted evidence', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersionEvidence(runsRoot, 'v001', { accepted: true });
      const index = await buildDashboardIndex(runsRoot);

      const html = renderDashboardHtml(index, { linkBase: '.' });

      expect(html).toContain('Dungeon Forge Version Dashboard');
      expect(html).toContain('Leaderboard');
      expect(html).toContain('href="runs/v001/acceptance.md"');
      expect(html).toContain('seed_001_careful_player.json');
      expect(html).toContain('Read-only: true');
    });
  });

  it('loads individual artifacts without allowing path traversal', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersionEvidence(runsRoot, 'v001');

      const payload = await loadArtifactPayload(
        runsRoot,
        'runs/v001/scorecards/seed_001_careful_player.json',
      );

      expect(payload.kind).toBe('scorecard');
      expect(payload.format).toBe('json');
      expect(payload.content).toContain('"persona": "careful_player"');
      await expect(loadArtifactPayload(runsRoot, '../package.json')).rejects.toThrow(
        'Artifact path must stay under runs/',
      );
      await expect(loadArtifactPayload(runsRoot, 'runs/../package.json')).rejects.toThrow(
        'Artifact path must not contain .. segments',
      );
    });
  });

  it('writes only an explicit derived HTML dashboard and leaves source evidence unchanged', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersionEvidence(runsRoot, 'v001', { accepted: true });
      const acceptancePath = path.join(runsRoot, 'runs/v001/acceptance.md');
      const before = await readFile(acceptancePath, 'utf8');
      const outPath = path.join(runsRoot, 'derived/dashboard/index.html');
      let stdout = '';

      await runVersionDashboardCli(['--runs-root', runsRoot, '--out', outPath], {
        stdout: (value) => {
          stdout += value;
        },
      });

      expect(stdout).toContain('Wrote version dashboard:');
      expect(await readFile(outPath, 'utf8')).toContain('Dungeon Forge Version Dashboard');
      expect(await readFile(acceptancePath, 'utf8')).toBe(before);
    });
  });
});
