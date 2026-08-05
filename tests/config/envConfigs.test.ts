import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  listEnvironments,
  getEnvironmentById,
  DEFAULT_ENVIRONMENTS,
} from '../../src/config/envConfigs.js';

describe('envConfigs', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'env-configs-test-'));
    process.env.DEV_AUTH_FETCHER_HOME = tempDir;
  });

  afterEach(async () => {
    delete process.env.DEV_AUTH_FETCHER_HOME;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('DEFAULT_ENVIRONMENTS contient les 6 environnements attendus', () => {
    expect(DEFAULT_ENVIRONMENTS).toHaveLength(7);
    const ids = DEFAULT_ENVIRONMENTS.map((e) => e.id);
    expect(ids).toContain('recette-ode1');
    expect(ids).toContain('recette-ode2');
    expect(ids).toContain('recette-ode3');
    expect(ids).toContain('recette-ode4');
    expect(ids).toContain('recette-ode5');
    expect(ids).toContain('recette-release');
    expect(ids).toContain('local');
  });

  it('listEnvironments charge les fichiers depuis config/environments', async () => {
    const envs = await listEnvironments();
    expect(Array.isArray(envs)).toBe(true);
    const hasRecetteOde1 = envs.some((e) => e.id === 'recette-ode1');
    expect(hasRecetteOde1).toBe(true);
  });

  it('getEnvironmentById retourne la config ou null', async () => {
    const env = await getEnvironmentById('recette-ode1');
    expect(env).not.toBeNull();
    expect(env?.url).toContain('recette-ode1');
    const missing = await getEnvironmentById('nonexistent');
    expect(missing).toBeNull();
  });
});
