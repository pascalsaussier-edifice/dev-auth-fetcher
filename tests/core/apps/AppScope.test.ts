import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect } from 'vitest';

import { detectAppScope } from '../../../src/core/apps/AppScope.js';

describe('detectAppScope', () => {
  const appsRoot = join(tmpdir(), 'dev-auth-fetcher-apps-root');

  it('détecte une app entcore (racine du dossier de l’app)', () => {
    const cwd = join(appsRoot, 'entcore', 'timeline');
    expect(detectAppScope(appsRoot, cwd)).toEqual({
      kind: 'app',
      appId: 'entcore/timeline',
      appName: 'timeline',
    });
  });

  it('détecte une app entcore depuis un sous-dossier (ex. frontend)', () => {
    const cwd = join(appsRoot, 'entcore', 'timeline', 'frontend', 'src');
    expect(detectAppScope(appsRoot, cwd)).toEqual({
      kind: 'app',
      appId: 'entcore/timeline',
      appName: 'timeline',
    });
  });

  it('détecte le groupe entcore à la racine du dossier entcore', () => {
    const cwd = join(appsRoot, 'entcore');
    expect(detectAppScope(appsRoot, cwd)).toEqual({ kind: 'entcore-group' });
  });

  it('détecte une app racine directe', () => {
    const cwd = join(appsRoot, 'actualites');
    expect(detectAppScope(appsRoot, cwd)).toEqual({
      kind: 'app',
      appId: 'actualites',
      appName: 'actualites',
    });
  });

  it('détecte une app racine depuis un sous-dossier', () => {
    const cwd = join(appsRoot, 'actualites', 'frontend', 'src');
    expect(detectAppScope(appsRoot, cwd)).toEqual({
      kind: 'app',
      appId: 'actualites',
      appName: 'actualites',
    });
  });

  it('retombe sur "none" à la racine de appsRoot', () => {
    expect(detectAppScope(appsRoot, appsRoot)).toEqual({ kind: 'none' });
  });

  it('retombe sur "none" en dehors de appsRoot', () => {
    expect(detectAppScope(appsRoot, join(tmpdir(), 'ailleurs'))).toEqual({ kind: 'none' });
  });
});
