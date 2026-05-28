import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createRunnerPackageCopy } from '../src/core/package-installer.js';

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

describe('create-agentic-runner package copy', () => {
  it('dry-runs without writing the target package folder', async () => {
    const targetRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-create-runner-test-'));
    try {
      const report = await createRunnerPackageCopy({ targetRoot });
      expect(report.status).toBe('planned');
      expect(report.copiedFiles).toContain('package.json');
      expect(await exists(path.join(targetRoot, 'agentic-phase-runner-package'))).toBe(false);
    } finally {
      await rm(targetRoot, { recursive: true, force: true });
    }
  });

  it('applies a filtered package copy', async () => {
    const targetRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-create-runner-test-'));
    try {
      const report = await createRunnerPackageCopy({ targetRoot, apply: true });
      expect(report.status).toBe('applied');
      expect(await exists(path.join(targetRoot, 'agentic-phase-runner-package', 'package.json'))).toBe(true);
      expect(await exists(path.join(targetRoot, 'agentic-phase-runner-package', 'dist'))).toBe(false);
      expect(await exists(path.join(targetRoot, 'agentic-phase-runner-package', 'node_modules'))).toBe(false);
    } finally {
      await rm(targetRoot, { recursive: true, force: true });
    }
  });
});
