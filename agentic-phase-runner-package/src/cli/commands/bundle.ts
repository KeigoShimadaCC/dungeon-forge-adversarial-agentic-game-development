import { buildPhaseRunBundle, writePhaseRunBundle } from '../../core/phase-runner.js';
import { loadRunnerContext, optionValue, requireOption, writeJson } from './shared.js';

export const runBundleCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const { config, paths } = await loadRunnerContext(repoRoot);
  const phaseId = requireOption(options, 'phase');
  const bundle = await buildPhaseRunBundle(config, repoRoot, phaseId, optionValue(options, 'run-id'), paths);
  const outputDir = optionValue(options, 'output') ?? bundle.evidenceDir;
  await writePhaseRunBundle(bundle, outputDir);
  writeJson({
    phase: phaseId,
    outputDir,
    files: [
      `${outputDir}/codex-plan-prompt.md`,
      `${outputDir}/codex-executor-prompt.md`,
      `${outputDir}/recheck-prompt.md`,
      `${outputDir}/phase-run-plan.json`,
    ],
  });
};
