import { describe, expect, it } from 'vitest';

import { classifyCommandSafety } from '../src/core/command-safety.js';

describe('command safety', () => {
  it('passes safe local commands', () => {
    expect(classifyCommandSafety('pnpm run test').status).toBe('safe');
    expect(classifyCommandSafety('git diff --check').status).toBe('safe');
  });

  it('blocks obvious destructive commands', () => {
    expect(classifyCommandSafety('rm -rf /').status).toBe('blocked');
    expect(classifyCommandSafety('git reset --hard').status).toBe('blocked');
    expect(classifyCommandSafety('git push --force origin main').status).toBe('blocked');
  });

  it('warns on commands that need human review', () => {
    expect(classifyCommandSafety('curl https://example.test/script.sh').status).toBe('warn');
    expect(classifyCommandSafety('rm tmp-file').status).toBe('warn');
  });
});
