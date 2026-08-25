import * as path from 'path';

/**
 * Scope d'app déduit du répertoire courant, utilisé pour filtrer l'historique des
 * connexions récentes (cf. credentialsStore.getRecentConnectionsForScope) :
 * - `app` : une app précise (id `<app>` ou `entcore/<app>`).
 * - `entcore-group` : à la racine de `entcore/`, sans app précise (plusieurs modules possibles).
 * - `none` : hors de `appsRoot` (ou à sa racine) — comportement non filtré.
 */
export type AppScope =
  | { kind: 'app'; appId: string; appName: string }
  | { kind: 'entcore-group' }
  | { kind: 'none' };

/**
 * Déduit le scope d'app depuis le répertoire courant, relatif à `appsRoot` :
 * - `<appsRoot>/entcore/<app>(/...)` → `{ kind: 'app', appId: 'entcore/<app>' }`
 * - `<appsRoot>/entcore` (exactement) → `{ kind: 'entcore-group' }`
 * - `<appsRoot>/<app>(/...)` → `{ kind: 'app', appId: '<app>' }`
 * - en dehors de `appsRoot`, ou à sa racine → `{ kind: 'none' }`
 */
export function detectAppScope(appsRoot: string, cwd: string): AppScope {
  const relative = path.relative(appsRoot, cwd);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { kind: 'none' };
  }

  const [first, second] = relative.split(path.sep).filter(Boolean);
  if (!first) return { kind: 'none' };

  if (first === 'entcore') {
    return second
      ? { kind: 'app', appId: `entcore/${second}`, appName: second }
      : { kind: 'entcore-group' };
  }

  return { kind: 'app', appId: first, appName: first };
}
