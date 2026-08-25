import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { AppScope } from '../core/apps/AppScope.js';
import { getCredentialsDir, getLegacyCredentialsDir } from '../utils/paths.js';

import type { UserProfile } from './config.types.js';

export interface LastConnection {
  envId: string;
  login: string;
  /** true si "toutes les applications" avaient été sélectionnées */
  allApps?: boolean;
  /** ids des applications sélectionnées (prioritaire pour reconnect) */
  appIds?: string[];
  /** noms des applications (rétrocompatibilité, affichage) */
  appNames?: string[];
}

export interface RecentConnection extends LastConnection {
  /** ms epoch — moment de la connexion. Sert aussi de clé de récence (tri des logins). */
  connectedAt: number;
  /** ms epoch — expiration estimée (Max-Age/Expires du cookie de session) ; absent si inconnu. */
  expiresAt?: number;
}

export interface UserCredentialsStore {
  environmentProfiles: Record<string, UserProfile[]>;
  /** plus-récent-d'abord, dédupliqué par signature, plafonné à RECENT_CONNECTIONS_STORAGE_CAP. */
  recentConnections?: RecentConnection[];
  /** legacy mono-entrée : lu pour migration uniquement, plus écrit. */
  lastConnection?: LastConnection;
}

/**
 * Nombre maximum de connexions récentes conservées en stockage. Plus grand que ce qui est
 * affiché (cf. RECENT_CONNECTIONS_DISPLAY_LIMIT) pour que le filtrage par scope d'app
 * (getRecentConnectionsForScope) ait assez d'historique pour retrouver 3 combos pertinents
 * même quand l'utilisateur alterne entre plusieurs apps/environnements.
 */
const RECENT_CONNECTIONS_STORAGE_CAP = 20;

/** Nombre de connexions récentes affichées, globalement ou pour un scope d'app donné. */
export const RECENT_CONNECTIONS_DISPLAY_LIMIT = 3;

const DEFAULT_STORE: UserCredentialsStore = {
  environmentProfiles: {},
  recentConnections: [],
};

/**
 * Identifiant de l'utilisateur courant (surchargeable via DEV_AUTH_USER).
 */
export function getUserId(): string {
  return process.env.DEV_AUTH_USER ?? os.userInfo().username;
}

/**
 * Chemin du fichier de credentials pour l'utilisateur courant (~/.dev-auth-fetcher/credentials).
 */
export function getUserCredentialsPath(): string {
  return path.join(getCredentialsDir(), getUserId() + '.json');
}

/** Ancien chemin du fichier de credentials (relatif au cwd), pour migration unique. */
function getLegacyUserCredentialsPath(): string {
  return path.join(getLegacyCredentialsDir(), getUserId() + '.json');
}

/**
 * Normalise l'historique des connexions au chargement, en migrant l'ancien champ
 * mono-entrée `lastConnection` vers `recentConnections` si nécessaire.
 */
function migrateRecentConnections(data: UserCredentialsStore): RecentConnection[] {
  if (Array.isArray(data.recentConnections) && data.recentConnections.length > 0) {
    return data.recentConnections;
  }
  if (data.lastConnection) {
    return [{ ...data.lastConnection, connectedAt: Date.now() }];
  }
  return [];
}

/** Lit et normalise un fichier store ; null si absent. */
async function readStoreFile(filePath: string): Promise<UserCredentialsStore | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as UserCredentialsStore;
    return {
      environmentProfiles: data.environmentProfiles ?? {},
      recentConnections: migrateRecentConnections(data),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Charge le store des credentials de l'utilisateur. Retourne un store vide s'il n'existe pas.
 * Migre une fois l'ancien fichier (relatif au cwd) vers le dossier de données utilisateur.
 */
export async function loadUserCredentialsStore(): Promise<UserCredentialsStore> {
  const current = await readStoreFile(getUserCredentialsPath());
  if (current) return current;

  const legacy = await readStoreFile(getLegacyUserCredentialsPath());
  if (legacy) {
    await saveUserCredentialsStore(legacy);
    return legacy;
  }
  return { ...DEFAULT_STORE };
}

/**
 * Sauvegarde le store des credentials (crée le répertoire si besoin).
 */
export async function saveUserCredentialsStore(store: UserCredentialsStore): Promise<void> {
  const filePath = getUserCredentialsPath();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Retourne la liste des profils enregistrés pour un environnement.
 */
export async function getProfilesForEnvironment(envId: string): Promise<UserProfile[]> {
  const store = await loadUserCredentialsStore();
  return store.environmentProfiles[envId] ?? [];
}

/**
 * Ajoute ou met à jour un profil pour un environnement (même login = mise à jour du mot de passe).
 */
export async function addOrUpdateProfileForEnvironment(
  envId: string,
  profile: UserProfile
): Promise<void> {
  const store = await loadUserCredentialsStore();
  if (!store.environmentProfiles[envId]) {
    store.environmentProfiles[envId] = [];
  }
  const list = store.environmentProfiles[envId];
  const existingIndex = list.findIndex((p) => p.login === profile.login);
  if (existingIndex >= 0) {
    list[existingIndex] = profile;
  } else {
    list.push(profile);
  }
  await saveUserCredentialsStore(store);
}

/**
 * Signature d'une connexion : env + login + jeu d'apps. Rend distincts les logins et
 * les jeux d'apps différents, déduplique le même combo (insensible à l'ordre des apps).
 */
export function connectionSignature(
  c: Pick<LastConnection, 'envId' | 'login' | 'allApps' | 'appIds' | 'appNames'>
): string {
  const apps = c.allApps ? 'ALL' : [...(c.appIds ?? c.appNames ?? [])].sort().join(',');
  return `${c.envId}::${c.login}::${apps}`;
}

/**
 * Retourne les connexions récentes (plus-récent-d'abord).
 */
export async function getRecentConnections(): Promise<RecentConnection[]> {
  const store = await loadUserCredentialsStore();
  return store.recentConnections ?? [];
}

/**
 * true si une connexion est pertinente pour un scope d'app (cf. detectAppScope) : une
 * connexion "toutes les apps" correspond toujours ; sinon on regarde si l'app du scope (ou,
 * pour le groupe entcore, une app `entcore/*`) fait partie de la sélection enregistrée.
 */
export function matchesAppScope(
  c: Pick<LastConnection, 'allApps' | 'appIds' | 'appNames'>,
  scope: AppScope
): boolean {
  if (scope.kind === 'none') return true;
  if (c.allApps) return true;
  if (scope.kind === 'entcore-group') {
    return c.appIds?.some((id) => id.startsWith('entcore/')) ?? false;
  }
  return (
    (c.appIds?.includes(scope.appId) ?? false) || (c.appNames?.includes(scope.appName) ?? false)
  );
}

/**
 * Connexions récentes filtrées par scope d'app (plus-récent-d'abord), plafonnées à `limit`.
 * Si le scope ne fournit pas assez de résultats (moins de `limit`), complète avec les
 * connexions récentes les plus récentes tous scopes confondus (sans dupliquer celles déjà
 * retenues). Scope `'none'` : comportement inchangé (les plus récentes, tous scopes confondus).
 */
export async function getRecentConnectionsForScope(
  scope: AppScope,
  limit: number = RECENT_CONNECTIONS_DISPLAY_LIMIT
): Promise<RecentConnection[]> {
  const recents = await getRecentConnections();
  const scoped = recents.filter((c) => matchesAppScope(c, scope));
  if (scoped.length >= limit) return scoped.slice(0, limit);

  const scopedSignatures = new Set(scoped.map((c) => connectionSignature(c)));
  const fallback = recents.filter((c) => !scopedSignatures.has(connectionSignature(c)));
  return [...scoped, ...fallback].slice(0, limit);
}

/**
 * Retourne la connexion la plus récente si disponible (rétrocompatibilité reconnect-last).
 */
export async function getLastConnection(): Promise<LastConnection | null> {
  const recents = await getRecentConnections();
  return recents[0] ?? null;
}

/**
 * Récence par login pour un environnement : `connectedAt` maximum observé par login.
 * Utilisé pour faire remonter les derniers identifiants utilisés.
 */
export async function getLoginRecency(envId: string): Promise<Map<string, number>> {
  const recents = await getRecentConnections();
  const recency = new Map<string, number>();
  for (const c of recents) {
    if (c.envId !== envId) continue;
    const prev = recency.get(c.login) ?? 0;
    if (c.connectedAt > prev) recency.set(c.login, c.connectedAt);
  }
  return recency;
}

/**
 * Enregistre une connexion (envId, login, sélection d'apps, expiration) en tête de
 * l'historique : déduplique par signature, place en premier, plafonne à
 * RECENT_CONNECTIONS_STORAGE_CAP.
 */
export async function recordConnection(
  envId: string,
  login: string,
  appSelection?: { allApps: boolean; appIds: string[]; appNames?: string[] },
  meta?: { expiresAt?: number }
): Promise<void> {
  const store = await loadUserCredentialsStore();
  const entry: RecentConnection = {
    envId,
    login,
    allApps: appSelection?.allApps,
    appIds: appSelection?.appIds?.length ? appSelection.appIds : undefined,
    appNames: appSelection?.appNames?.length ? appSelection.appNames : undefined,
    connectedAt: Date.now(),
    expiresAt: meta?.expiresAt,
  };
  const signature = connectionSignature(entry);
  const previous = (store.recentConnections ?? []).filter(
    (c) => connectionSignature(c) !== signature
  );
  store.recentConnections = [entry, ...previous].slice(0, RECENT_CONNECTIONS_STORAGE_CAP);
  await saveUserCredentialsStore(store);
}
