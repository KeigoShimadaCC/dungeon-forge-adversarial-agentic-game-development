import { formatVersionText, getVersionInfo } from '../../core/version.js';
import { writeJson } from './shared.js';

export const runVersionCommand = async (
  options: Record<string, string | boolean>,
): Promise<void> => {
  const info = await getVersionInfo();
  if (options.json === true) {
    writeJson(info);
    return;
  }
  process.stdout.write(formatVersionText(info));
};
