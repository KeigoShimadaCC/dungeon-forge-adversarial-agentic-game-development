import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertCompleteControlRoomRoleCatalog,
  buildControlRoomRoleCatalog,
  getControlRoomRole,
  listControlRoomReviewerPersonas,
  stringifyControlRoomRoleCatalog,
  CONTROL_ROOM_ROLE_CATALOG_SCHEMA_VERSION,
} from '../src/control-room/roles/index.js';
import { getControlRoomReviewerPersona } from '../src/control-room/roles/personas.js';
import { LLM_MODEL_ENV } from '../src/harness/llm-provider-config.js';
import { listReviewerPersonaMetadata } from '../src/harness/reviewer-personas.js';

const roleCatalog = buildControlRoomRoleCatalog();

const stringify = (value: unknown): string => JSON.stringify(value);

describe('PHASE-25B control-room role catalog', () => {
  it('lists every actor a future control-room UI needs to label speakers', () => {
    assertCompleteControlRoomRoleCatalog(roleCatalog);

    expect(roleCatalog.roles.map((role) => role.id)).toEqual([
      'game_developer',
      'game_reviewer',
      'narrator',
      'human',
    ]);
    expect(roleCatalog.roles.map((role) => role.roleKind)).toEqual([
      'developer_ai',
      'reviewer_ai',
      'narrator_ai',
      'human',
    ]);
    expect(getControlRoomRole('game_reviewer')).toMatchObject({
      displayName: 'Game Reviewer',
      defaultPersonaId: 'careful_player',
    });
  });

  it('projects canonical reviewer personas into stable selectable metadata', () => {
    const reviewerRole = getControlRoomRole('game_reviewer');
    const harnessPersonas = listReviewerPersonaMetadata();
    const controlRoomPersonas = listControlRoomReviewerPersonas();

    expect(controlRoomPersonas.map((persona) => persona.id)).toEqual([
      'careful_player',
      'naive_player',
      'bug_hunter',
    ]);
    expect(controlRoomPersonas).toEqual(
      harnessPersonas.map((persona) => ({
        id: persona.id,
        displayName: persona.display_name,
        description: persona.description,
        emphasis: persona.emphasis,
        playerPolicyHint: persona.player_policy_hint,
        selectable: true,
      })),
    );
    expect(reviewerRole?.personas).toEqual(controlRoomPersonas);
    expect(getControlRoomReviewerPersona('careful_player')).toMatchObject({
      id: 'careful_player',
      selectable: true,
    });
    expect(getControlRoomReviewerPersona('bug_hunter')?.displayName).toBe('Bug Hunter');
    expect(
      getControlRoomReviewerPersona('unknown_persona' as 'careful_player'),
    ).toBeUndefined();
  });

  it('limits model env metadata to the model label variable only', () => {
    const envVars = roleCatalog.roles.flatMap((role) =>
      role.modelChoices.flatMap((choice) => choice.configurableEnvVars),
    );
    const secretNameFragments = ['API', 'KEY', 'OPENAI', 'BASE', 'URL'];

    expect(new Set(envVars)).toEqual(new Set([LLM_MODEL_ENV]));
    for (const envVar of envVars) {
      for (const fragment of secretNameFragments) {
        expect(envVar).not.toContain(fragment);
      }
    }
  });

  it('describes prompts safely without serializing runtime prompt input or credential values', () => {
    const serialized = stringify(roleCatalog);
    const dynamicPrompts = roleCatalog.roles.flatMap((role) =>
      role.prompts.filter((prompt) => prompt.level === 'dynamic_runtime_reference'),
    );
    const staticPrompts = roleCatalog.roles.flatMap((role) =>
      role.prompts.filter((prompt) => prompt.level === 'safe_repo_reference'),
    );

    expect(dynamicPrompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'LLM reviewer runtime prompt',
          sourceReferences: [
            expect.objectContaining({
              path: 'src/agents/prompts/llm-reviewer.ts',
              exportName: 'buildLlmReviewerPrompt',
            }),
          ],
        }),
      ]),
    );
    expect(dynamicPrompts[0]).not.toHaveProperty('safeToDisplayText');
    expect(staticPrompts.map((prompt) => prompt.sourceReferences[0]?.path)).toEqual(
      expect.arrayContaining([
        'src/agents/prompts/developer.md',
        'src/agents/prompts/reviewer.md',
        'phase-plans/PHASE-27B-NARRATED-VERSION-SUMMARIES.md',
      ]),
    );
    expect(serialized).not.toContain('Game input JSON');
    expect(serialized).not.toContain('Evidence JSON');
    expect(serialized).not.toContain('secret-value-from-env');
    expect(serialized).not.toContain('https://user:pass@example.test/v1');
  });

  it('keeps model choices advisory and credential-free by default', () => {
    const envRecord = globalThis.process?.env as Record<string, string | undefined> | undefined;
    const priorModel = envRecord?.DUNGEON_FORGE_LLM_MODEL;
    const primarySecretName = ['DUNGEON', 'FORGE', 'LLM', 'API', 'KEY'].join('_');
    const alternateSecretName = ['OPENAI', 'API', 'KEY'].join('_');

    if (envRecord) {
      envRecord.DUNGEON_FORGE_LLM_MODEL = 'poison-model-from-env';
      envRecord[primarySecretName] = 'secret-value-from-env';
      envRecord[alternateSecretName] = 'alternate-secret-value';
    }

    try {
      const freshCatalog = buildControlRoomRoleCatalog();
      const serialized = stringify(freshCatalog);
      const choices = freshCatalog.roles.flatMap((role) => role.modelChoices);

      expect(choices.length).toBeGreaterThan(0);
      for (const choice of choices) {
        expect(choice.advisoryOnly).toBe(true);
        expect(choice.providerCallEnabled).toBe(false);
        expect(choice.configurableEnvVars).not.toContain(primarySecretName);
        expect(choice.configurableEnvVars).not.toContain(alternateSecretName);
      }
      expect(serialized).not.toContain('poison-model-from-env');
      expect(serialized).not.toContain('secret-value-from-env');
      expect(serialized).not.toContain('alternate-secret-value');
    } finally {
      if (envRecord) {
        if (priorModel === undefined) {
          delete envRecord.DUNGEON_FORGE_LLM_MODEL;
        } else {
          envRecord.DUNGEON_FORGE_LLM_MODEL = priorModel;
        }
        delete envRecord[primarySecretName];
        delete envRecord[alternateSecretName];
      }
    }
  });

  it('serializes to the committed deterministic fixture', async () => {
    const fixtureRaw = await readFile(
      path.join(process.cwd(), 'tests/fixtures/control-room-roles/catalog.json'),
      'utf8',
    );

    expect(roleCatalog.schemaVersion).toBe(CONTROL_ROOM_ROLE_CATALOG_SCHEMA_VERSION);
    expect(JSON.parse(fixtureRaw)).toEqual(JSON.parse(stringifyControlRoomRoleCatalog(roleCatalog)));
  });
});
