import { listAgentPresets } from '../../core/agent-presets.js';
import { writeJson } from './shared.js';

export const runPresetsCommand = async (
  options: Record<string, string | boolean>,
): Promise<void> => {
  const presets = listAgentPresets();
  if (options.json === true) {
    writeJson({ schemaVersion: 1, presets });
    return;
  }
  process.stdout.write(
    [
      'Agent provider presets:',
      '',
      ...presets.map((preset) => `- ${preset.id}: ${preset.description}`),
      '',
    ].join('\n'),
  );
};
