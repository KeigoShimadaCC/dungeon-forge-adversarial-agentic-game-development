import { runDoctor } from '../../core/doctor.js';
import { writeJson } from './shared.js';

export const runDoctorCommand = async (
  repoRoot: string,
  _options: Record<string, string | boolean>,
): Promise<void> => {
  writeJson(await runDoctor(repoRoot));
};
