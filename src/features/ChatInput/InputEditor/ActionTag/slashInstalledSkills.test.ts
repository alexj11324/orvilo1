import { describe, expect, it } from 'vitest';

import { resolveSlashInstalledSkills } from './slashInstalledSkills';
import type { ActionTagData } from './types';

const item = (category: ActionTagData['category'], type: string): ActionTagData => ({
  category,
  label: type,
  type,
});
const installed = [item('skill', 'artifacts'), item('tool', 'search'), item('skill', 'orvilo')];

describe('resolveSlashInstalledSkills', () => {
  it('offers the installed skills, without tools, to a built-in Agent', () => {
    expect(resolveSlashInstalledSkills(installed, false).map((skill) => skill.type)).toEqual([
      'artifacts',
      'orvilo',
    ]);
  });

  it('offers none to an external CLI Agent, which cannot invoke them', () => {
    expect(resolveSlashInstalledSkills(installed, true)).toEqual([]);
  });
});
