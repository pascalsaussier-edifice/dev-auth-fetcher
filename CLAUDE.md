# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

`dev-auth-fetcher` — CLI Node/TypeScript qui s'authentifie sur un environnement de recette Edifice (ENT) et injecte les cookies de session (`VITE_XSRF_TOKEN`, `VITE_ONE_SESSION_ID`, `VITE_RECETTE`) dans les fichiers `.env` des frontends Vite locaux. Permet de pointer un front local sur un backend de recette sans relogin manuel.

## Stack

- **Node >= 24**, projet **ESM** (`"type": "module"`) — tous les imports internes portent l'extension `.js` (résolution NodeNext), même depuis des sources `.ts`.
- **pnpm** (gestionnaire de paquets).
- **commander** (CLI), **inquirer** (prompts interactifs), **ora** (spinners), **chalk** (couleurs).
- **tsup** pour le build, **tsx** pour l'exécution en dev, **vitest** pour les tests, **eslint** + **prettier**.

## Commandes

```bash
pnpm install
pnpm run dev <command>     # exécute via tsx sans build (ex: pnpm run dev connect)
pnpm run build             # bundle ESM dans dist/ via tsup
pnpm start                 # node dist/index.js (après build)
pnpm run typecheck         # tsc --noEmit sur src + tests (tsconfig.typecheck.json)
pnpm test                  # vitest run (une passe). Un seul fichier : pnpm test tests/utils/envFile.test.ts
pnpm run test:watch        # vitest en mode watch
pnpm run lint              # eslint sur src/ et tests/
pnpm run format            # prettier --write
pnpm run format:check
```

> Le build (tsup) type via `tsconfig.json` (src uniquement). `pnpm run typecheck` couvre **aussi** `tests/` via `tsconfig.typecheck.json` — c'est là que les erreurs de type des tests sont détectées (CI : typecheck → lint → format:check → test).

Le binaire (`bin/dev-auth-fetcher`) charge `dist/index.js` : il faut **builder avant** de lancer via `node bin/...`. Commandes CLI : `onboard`, `connect`, `list-apps`, `reconnect-last` (voir README pour les options).

## Architecture

Flux en couches, du plus haut au plus bas niveau :

- **`src/cli/`** — entrée commander (`index.ts`) et `commands/` : chaque commande délègue à un service.
- **`src/services/`** — orchestrateurs. `EnvSyncService` pilote `connect` (choix env → apps → identifiant → auth → écriture .env) ; `OnboardingService` pilote `onboard`.
- **`src/steps/`** — étapes interactives réutilisables (prompts inquirer), regroupées par parcours (`connect/`, `onboarding/`). Les services composent ces steps.
- **`src/core/`** — logique métier sans I/O interactif :
  - `auth/` — `IAuthClient` + `FetchAuthClient` : POST `x-www-form-urlencoded` sur `<envUrl>/auth/login` avec `redirect: 'manual'` et timeout (`AbortController`), parse les `Set-Cookie`. Valide `authenticated=true` puis extrait `XSRF-TOKEN` (URL-décodé) et `oneSessionId`. Injecté dans `EnvSyncService` (constructeur) → service testable sans réseau.
  - `env/EnvManager` — applique le patch de cookies aux `.env`, **en préservant les variables existantes**.
  - `apps/AppDiscovery` — scanne `appsRoot` ; détecte **4 schémas** : `<app>/frontend`, `<app>/` directe (`.env` + `package.json` sans sous-dossier `frontend`), `entcore/<app>/frontend`, et `entcore/<app>/src/main/ts` (id = `entcore/<app>`).
  - `apps/AppScope` — déduit un `AppScope` (`app` / `entcore-group` / `none`) du répertoire courant relatif à `appsRoot`, utilisé par `EnvSyncService` pour scoper la liste des reconnexions rapides (`credentialsStore.getRecentConnectionsForScope`) à l'app (ou au groupe entcore) depuis laquelle `connect` est lancé.
- **`src/config/`** — `appConfig` (`~/.dev-auth-fetcher/config.json` : `appsRoot`, `defaultEnvironment`), `envConfigs` (environnements dans `~/.dev-auth-fetcher/environments/`, seedés depuis `DEFAULT_ENVIRONMENTS` — source partagée versionnée dans le code), `credentialsStore` (profils + historique des connexions récentes, **par utilisateur**, dans `~/.dev-auth-fetcher/credentials/`), `config.types.ts` (types + `VITE_ENV_KEYS`).
- **`src/utils/`** — `envFile` (parse/merge/write `.env`), `paths` (helpers cross-platform), `logger`, classes d'erreurs (`errors.ts`).

## Conventions & points de vigilance

- **Cross-platform** (macOS / Linux / Windows) : toujours passer par `path.join`/`path.resolve` (helpers dans `utils/paths.ts`), jamais de `/` concaténé en dur.
- **Données utilisateur centralisées hors du repo** : config + credentials vivent dans `~/.dev-auth-fetcher/` (`config.json` + `credentials/<user>.json`), surchargeable via `DEV_AUTH_FETCHER_HOME` (`getUserDataDir` dans `utils/paths.ts`). `<user>` = `DEV_AUTH_USER` ?? `os.userInfo().username`. `loadAppConfig`/`loadUserCredentialsStore` migrent une fois les anciens emplacements relatifs au cwd (`config/app.config.json`, `./.dev-auth-fetcher/`). Ne jamais logger de mot de passe.
- **Préserver les `.env` cibles** : `updateAppEnv` re-merge l'existant ; seules les clés `VITE_*` (cf. `VITE_ENV_KEYS`) sont écrasées, avec des commentaires d'en-tête (login + date).
- **Erreurs typées** : lever les classes de `utils/errors.ts` (`AuthError`, `AppConfigError`, `EnvFileError`, `AppDiscoveryError`) plutôt que des `Error` nus.
- **Imports** : règle eslint `import/order` (groupes triés, `newlines-between: always`). Prettier : `singleQuote: true`, `semi: true`, `printWidth: 100`.
- **Tests** dans `tests/`, miroir de `src/`, alias `@` → `src` (cf. `vitest.config.ts`). `tsconfig` exclut `tests` du build.
- **Tout l'état runtime vit dans `~/.dev-auth-fetcher/`** (config + credentials + environments) → la CLI est **indépendante du `process.cwd()`** et fonctionne en install global, pas seulement depuis la racine du repo. La liste partagée d'environnements est versionnée **dans le code** (`DEFAULT_ENVIRONMENTS`) et seedée vers le dossier utilisateur ; `listEnvironments` seede au premier usage (migration unique de l'ancien `config/environments/` si présent, sinon défauts du code).
