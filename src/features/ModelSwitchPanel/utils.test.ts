import { describe, expect, it } from 'vitest';

import { toSimpleEnabledList } from './utils';

describe('toSimpleEnabledList', () => {
  it('wraps a flat option list into one provider, preserving the source order', () => {
    expect(
      toSimpleEnabledList({
        id: 'codex',
        name: 'Codex',
        options: [
          { title: 'GPT-5.6 Sol', value: 'gpt-5.6-sol' },
          { title: 'GPT-5.5', value: 'gpt-5.5' },
        ],
      }),
    ).toEqual([
      {
        children: [
          { abilities: {}, displayName: 'GPT-5.6 Sol', id: 'gpt-5.6-sol' },
          { abilities: {}, displayName: 'GPT-5.5', id: 'gpt-5.5' },
        ],
        id: 'codex',
        name: 'Codex',
        source: 'builtin',
      },
    ]);
  });
});
