import { render } from '@inquirer/testing';
import { describe, it, expect } from 'vitest';

import { Separator, searchableCheckbox } from '../../../src/utils/prompts/searchableCheckbox.js';

const CHOICES = [
  { name: 'Toutes les applications', value: '__all__', pinned: true },
  new Separator(),
  { name: 'timeline', value: 'timeline' },
  { name: 'portal', value: 'portal' },
  { name: 'blog', value: 'blog' },
];

describe('searchableCheckbox', () => {
  it('filtre la liste en tapant, en conservant les entrées épinglées', async () => {
    const { events, getScreen } = await render(searchableCheckbox, {
      message: 'Sélectionnez les applications :',
      choices: CHOICES,
    });

    events.type('time');

    const screen = getScreen();
    expect(screen).toContain('Recherche : time');
    expect(screen).toContain('timeline');
    expect(screen).toContain('Toutes les applications');
    expect(screen).not.toContain('portal');
    expect(screen).not.toContain('blog');
  });

  it('affiche un message quand le filtre ne correspond à rien', async () => {
    const { events, getScreen } = await render(searchableCheckbox, {
      message: 'Sélectionnez les applications :',
      choices: CHOICES,
    });

    events.type('zzz');

    expect(getScreen()).toContain('aucune application ne correspond à ce filtre');
  });

  it('efface le filtre au backspace et restaure la liste complète', async () => {
    const { events, getScreen } = await render(searchableCheckbox, {
      message: 'Sélectionnez les applications :',
      choices: CHOICES,
    });

    events.type('time');
    events.keypress('backspace');
    events.keypress('backspace');
    events.keypress('backspace');
    events.keypress('backspace');

    const screen = getScreen();
    expect(screen).toContain('Recherche :');
    expect(screen).toContain('portal');
    expect(screen).toContain('blog');
  });

  it('les flèches haut/bas naviguent sans modifier le texte de recherche', async () => {
    const { events, getScreen } = await render(searchableCheckbox, {
      message: 'Sélectionnez les applications :',
      choices: CHOICES,
    });

    events.type('o');
    events.keypress('down');
    events.keypress('down');
    events.keypress('up');

    expect(getScreen()).toContain('Recherche : o');
  });

  it('espace sélectionne l’item filtré et entrée valide la sélection', async () => {
    const { answer, events } = await render(searchableCheckbox, {
      message: 'Sélectionnez les applications :',
      choices: CHOICES,
    });

    events.type('time');
    events.keypress('space');
    events.keypress('enter');

    await expect(answer).resolves.toEqual(['timeline']);
  });

  it('sélectionner "Toutes les applications" retourne sa valeur', async () => {
    const { answer, events } = await render(searchableCheckbox, {
      message: 'Sélectionnez les applications :',
      choices: CHOICES,
    });

    events.keypress('space');
    events.keypress('enter');

    await expect(answer).resolves.toEqual(['__all__']);
  });

  it('valider sans sélection renvoie un tableau vide', async () => {
    const { answer, events } = await render(searchableCheckbox, {
      message: 'Sélectionnez les applications :',
      choices: CHOICES,
    });

    events.keypress('down');
    events.keypress('enter');

    await expect(answer).resolves.toEqual([]);
  });
});
