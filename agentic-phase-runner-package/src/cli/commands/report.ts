import { generateRunReport } from '../../core/report.js';
import { optionValue, writeJson } from './shared.js';

export const runReportCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  writeJson(
    await generateRunReport(repoRoot, {
      phase: optionValue(options, 'phase'),
      runId: optionValue(options, 'run-id'),
      latest: options.latest === true,
      output: optionValue(options, 'output'),
    }),
  );
};
