'use client';

import { defineFixtures, single } from './_helpers';

export default defineFixtures({
  identifier: 'orvilo-activator',
  fixtures: {
    activateSkill: single({
      content:
        'This skill focuses on shipping UI previews fast while keeping the registry easy to extend.',
      pluginState: {
        description: 'A lightweight workflow for building internal preview harnesses.',
        name: 'Preview Builder',
      },
    }),
  },
});
