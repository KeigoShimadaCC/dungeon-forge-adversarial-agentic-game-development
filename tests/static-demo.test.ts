import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildStaticDemoBundle,
  exportStaticDemoBundle,
  parseStaticDemoExportCliArgs,
  renderStaticDemoHtml,
  renderStaticDemoMarkdown,
  runStaticDemoExportCli,
} from '../src/static-demo/index.js';
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
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-static-demo-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stringifyDeterministicJson(value)}\n`, 'utf8');
};

const seedVersionEvidence = async (
  runsRoot: string,
  version: string,
  options: { status?: 'accepted' | 'rejected' | 'blocked' | 'pending'; winOffset?: number } = {},
): Promise<void> => {
  const { paths } = await ensureVersionFolder(runsRoot, version);
  const winOffset = options.winOffset ?? 0;
  const status = options.status ?? 'pending';

  for (const [index, spec] of VERSION_RUNS.entries()) {
    const result: PlaythroughTrace['result'] = index + winOffset < 2 ? 'WIN' : 'LOSS';
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
      summary: `${version} ${spec.seed} review`,
      scores: scorecard.reviewer_scores,
      top_issues: [],
    });
    await writeJson(path.join(runsRoot, scorecardPath), scorecard);
  }

  await writeFile(
    paths.acceptancePath,
    `# Acceptance\n\n## Human decision\n\nStatus: ${status}\n`,
    'utf8',
  );
  await writeFile(paths.changelogPath, `# Changelog\n\n- ${version} evidence seeded.\n`, 'utf8');
  await writeFile(paths.patchPlanPath, `# Patch Plan\n\n- ${version} plan.\n`, 'utf8');
  await writeFile(paths.developerNotesPath, `# Developer Notes\n\n- ${version} notes.\n`, 'utf8');
  await persistVersionSummary(runsRoot, version, VERSION_RUNS, { onExisting: 'overwrite' });
};

describe('Phase 18C static demo publishing', () => {
  it('exports a complete static bundle with traceable timeline, comparisons, and acceptance labels', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersionEvidence(runsRoot, 'v001', { status: 'accepted' });
      await seedVersionEvidence(runsRoot, 'v002', { status: 'rejected', winOffset: 1 });
      await persistVersionComparison(runsRoot, 'v001', 'v002', { onExisting: 'overwrite' });
      const acceptancePath = path.join(runsRoot, 'runs/v001/acceptance.md');
      const before = await readFile(acceptancePath, 'utf8');
      const outDir = path.join(runsRoot, 'published-demo');

      const result = await exportStaticDemoBundle(runsRoot, outDir);

      expect(result.files.map((file) => path.basename(file))).toEqual([
        'index.html',
        'index.md',
        'manifest.json',
      ]);
      expect(await readFile(acceptancePath, 'utf8')).toBe(before);
      const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
      const markdown = await readFile(path.join(outDir, 'index.md'), 'utf8');
      const manifest = await readFile(path.join(outDir, 'manifest.json'), 'utf8');

      expect(html).toContain('Dungeon Forge Static Demo');
      expect(html).toContain('Version timeline');
      expect(html).toContain('accepted');
      expect(html).toContain('rejected');
      expect(html).toContain('Trace-backed artifacts');
      expect(html).toContain('runs/v001/traces/seed_001_careful_player.json');
      expect(markdown).toContain('## Version comparisons');
      expect(markdown).toContain('v001 -> v002');
      expect(manifest).toContain('"readOnly": true');
      expect(manifest).toContain('"acceptanceStatus": "accepted"');
    });
  });

  it('keeps partial and missing evidence visible instead of fabricating artifacts', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await ensureVersionFolder(runsRoot, 'v001');

      const bundle = await buildStaticDemoBundle(runsRoot);
      const html = renderStaticDemoHtml(bundle);
      const markdown = renderStaticDemoMarkdown(bundle);

      expect(bundle.timeline[0]).toMatchObject({
        version: 'v001',
        coverageStatus: 'partial',
        acceptanceStatus: 'pending',
      });
      expect(bundle.timeline[0]?.missingArtifactCount).toBeGreaterThan(0);
      expect(html).toContain('Missing generated evidence');
      expect(html).toContain('(missing)');
      expect(markdown).toContain('partial');
      expect(markdown).toContain('Missing generated evidence');
    });
  });

  it('supports stdout JSON and Markdown modes without writing files', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersionEvidence(runsRoot, 'v001', { status: 'blocked' });
      let jsonStdout = '';
      let markdownStdout = '';

      await runStaticDemoExportCli(['--runs-root', runsRoot, '--json'], {
        stdout: (value) => {
          jsonStdout += value;
        },
      });
      await runStaticDemoExportCli(['--runs-root', runsRoot, '--markdown'], {
        stdout: (value) => {
          markdownStdout += value;
        },
      });

      expect(jsonStdout).toContain('"readOnly": true');
      expect(jsonStdout).toContain('"v001"');
      expect(markdownStdout).toContain('# Dungeon Forge Static Demo');
      expect(markdownStdout).toContain('blocked');
      expect(() => parseStaticDemoExportCliArgs(['--json', '--markdown'])).toThrow(
        '--json cannot be combined with --markdown.',
      );
    });
  });
});
