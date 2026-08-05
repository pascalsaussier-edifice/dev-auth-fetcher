import { discoverApps } from '../../core/apps/AppDiscovery.js';
import type { AppSummary } from '../../core/apps/AppDiscovery.js';
import { Separator, searchableCheckbox } from '../../utils/prompts/searchableCheckbox.js';

export interface SelectAppsResult {
  apps: AppSummary[];
  /** true si l'utilisateur a choisi "toutes les applications" ou si options.all était passé */
  allSelected: boolean;
}

const CHOICE_ALL = '__all__';

/**
 * Découvre les applications et permet de sélectionner une app, toutes, ou une liste.
 * Si options.apps (noms) est fourni et non vide, retourne ces apps sans prompt.
 */
export async function selectAppsStep(
  appsRoot: string,
  options: { app?: string; all?: boolean; apps?: string[] }
): Promise<SelectAppsResult> {
  const discovered = await discoverApps(appsRoot);

  if (discovered.length === 0) {
    return { apps: [], allSelected: false };
  }

  if (options.all) {
    return { apps: discovered, allSelected: true };
  }

  if (options.apps && options.apps.length > 0) {
    const byId = discovered.filter((a) => options.apps!.includes(a.id));
    if (byId.length > 0) return { apps: byId, allSelected: false };
    const byName = discovered.filter((a) => options.apps!.includes(a.name));
    return { apps: byName, allSelected: false };
  }

  if (options.app) {
    if (options.app.startsWith('entcore/')) {
      const found = discovered.find((a) => a.id === options.app);
      return { apps: found ? [found] : [], allSelected: false };
    }
    const found = discovered.find((a) => a.name === options.app);
    return { apps: found ? [found] : [], allSelected: false };
  }

  const selected = await searchableCheckbox({
    message: 'Sélectionnez les applications à mettre à jour :',
    choices: [
      { name: 'Toutes les applications', value: CHOICE_ALL, pinned: true },
      new Separator(),
      ...discovered.map((a) => ({
        name: a.id !== a.name ? `${a.name} (${a.id})` : a.name,
        value: a.id,
      })),
    ],
  });

  if (selected.includes(CHOICE_ALL)) {
    return { apps: discovered, allSelected: true };
  }
  if (selected.length === 0) {
    return { apps: [], allSelected: false };
  }
  const apps = discovered.filter((a) => selected.includes(a.id));
  return { apps, allSelected: false };
}
