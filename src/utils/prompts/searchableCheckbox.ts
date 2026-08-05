import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  makeTheme,
  Separator,
  useKeypress,
  useMemo,
  usePagination,
  usePrefix,
  useState,
} from '@inquirer/core';
import type { Prompt } from '@inquirer/type';

export { Separator };

export interface SearchableCheckboxChoice {
  name: string;
  value: string;
  checked?: boolean;
  /** Toujours affiché, non affecté par le filtre de recherche (ex. "Toutes les applications"). */
  pinned?: boolean;
}

interface NormalizedChoice {
  name: string;
  value: string;
  checked: boolean;
  pinned: boolean;
}

type Item = NormalizedChoice | Separator;

export interface SearchableCheckboxConfig {
  message: string;
  choices: ReadonlyArray<SearchableCheckboxChoice | Separator>;
  pageSize?: number;
}

function isChoice(item: Item): item is NormalizedChoice {
  return !Separator.isSeparator(item);
}

function isChecked(item: Item): item is NormalizedChoice {
  return isChoice(item) && item.checked;
}

function toggle(item: Item): Item {
  return isChoice(item) ? { ...item, checked: !item.checked } : item;
}

function normalizeChoices(choices: ReadonlyArray<SearchableCheckboxChoice | Separator>): Item[] {
  return choices.map((choice) =>
    Separator.isSeparator(choice)
      ? choice
      : {
          name: choice.name,
          value: choice.value,
          checked: choice.checked ?? false,
          pinned: choice.pinned ?? false,
        }
  );
}

function matchesSearch(item: NormalizedChoice, term: string): boolean {
  return item.pinned || item.name.toLowerCase().includes(term);
}

function filterItems(items: ReadonlyArray<Item>, search: string): Item[] {
  const term = search.trim().toLowerCase();
  if (!term) return [...items];
  return items.filter((item) => Separator.isSeparator(item) || matchesSearch(item, term));
}

function firstNavigableIndex(items: ReadonlyArray<Item>): number {
  return items.findIndex(isChoice);
}

/**
 * Index à activer après un changement de filtre : privilégie le premier résultat
 * réel plutôt que l'entrée épinglée (ex. "Toutes les applications"), qui reste
 * toujours visible mais ne doit pas voler le curseur pendant une recherche.
 */
function firstMatchIndex(items: ReadonlyArray<Item>, search: string): number {
  if (!search.trim()) return firstNavigableIndex(items);
  const firstRealMatch = items.findIndex((item) => isChoice(item) && !item.pinned);
  return firstRealMatch !== -1 ? firstRealMatch : firstNavigableIndex(items);
}

function hasRealMatch(items: ReadonlyArray<Item>): boolean {
  return items.some((item) => isChoice(item) && !item.pinned);
}

/**
 * Checkbox inquirer avec filtrage en direct : toute frappe non réservée (navigation/sélection)
 * édite un texte de recherche qui filtre la liste affichée en temps réel.
 */
export const searchableCheckbox: Prompt<string[], SearchableCheckboxConfig> = createPrompt<
  string[],
  SearchableCheckboxConfig
>((config, done) => {
  const { pageSize = 10 } = config;
  const theme = makeTheme();
  const [status, setStatus] = useState<'idle' | 'done'>('idle');
  const prefix = usePrefix({ status, theme });
  const [allItems, setAllItems] = useState(() => normalizeChoices(config.choices));
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(() => firstMatchIndex(normalizeChoices(config.choices), ''));

  const visibleItems = useMemo(() => filterItems(allItems, search), [allItems, search]);

  useKeypress((key, rl) => {
    if (status === 'done') return;

    if (isEnterKey(key)) {
      const selection = allItems.filter(isChecked);
      setStatus('done');
      done(selection.map((choice) => choice.value));
      return;
    }

    if (isUpKey(key) || isDownKey(key)) {
      // Ces touches ne doivent pas modifier le texte de recherche : on annule
      // la mutation que readline vient d'appliquer à sa ligne interne.
      rl.clearLine(0);
      rl.write(search);
      const first = firstNavigableIndex(visibleItems);
      if (first !== -1) {
        const offset = isUpKey(key) ? -1 : 1;
        let next = active;
        do {
          next = (next + offset + visibleItems.length) % visibleItems.length;
        } while (!isChoice(visibleItems[next] as Item));
        setActive(next);
      }
      return;
    }

    if (isSpaceKey(key)) {
      rl.clearLine(0);
      rl.write(search);
      const activeItem = visibleItems[active];
      if (activeItem && isChoice(activeItem)) {
        setAllItems(allItems.map((item) => (item === activeItem ? toggle(item) : item)));
      }
      return;
    }

    if (rl.line === search) return;

    const nextSearch = rl.line;
    setSearch(nextSearch);
    setActive(firstMatchIndex(filterItems(allItems, nextSearch), nextSearch));
  });

  const message = theme.style.message(config.message, status);

  if (status === 'done') {
    const selection = allItems.filter(isChecked);
    const answer = theme.style.answer(selection.map((choice) => choice.name).join(', '));
    return [prefix, message, answer].filter(Boolean).join(' ');
  }

  const page = usePagination({
    items: visibleItems,
    active,
    renderItem({ item, isActive }) {
      if (Separator.isSeparator(item)) {
        return ` ${item.separator}`;
      }
      const cursor = isActive ? '❯' : ' ';
      const checkbox = item.checked ? theme.style.highlight('◉') : '◯';
      const line = `${cursor}${checkbox} ${item.name}`;
      return isActive ? theme.style.highlight(line) : line;
    },
    pageSize,
    loop: true,
  });

  const searchLine = `${theme.style.help('Recherche :')} ${search}`;
  const hasNoMatch = search.trim() !== '' && !hasRealMatch(visibleItems);
  const emptyLine = hasNoMatch
    ? theme.style.help('  (aucune application ne correspond à ce filtre)')
    : '';
  const helpLine = theme.style.help(
    '↑↓ naviguer · espace sélectionner · ⏎ valider · tapez pour filtrer'
  );

  return [`${prefix} ${message}`, searchLine, page, emptyLine, helpLine].filter(Boolean).join('\n');
});
