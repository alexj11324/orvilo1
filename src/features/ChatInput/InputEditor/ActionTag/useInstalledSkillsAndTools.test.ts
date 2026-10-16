import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useInstalledSkillsAndTools } from './useInstalledSkillsAndTools';

vi.mock('@/store/tool', () => ({
  useToolStore: (selector: (state: unknown) => unknown) =>
    selector({
      installedPlugins: [{ identifier: 'thirdparty-mcp' }],
      customConnectors: [{ identifier: 'custom-mcp', isEnabled: true, tools: [{}] }],
      agentSkills: [{ identifier: 'market-skill', source: 'market' }],
    }),
}));
vi.mock('@/store/tool/selectors', () => ({
  builtinToolSelectors: {
    installedBuiltinSkills: () => [{ identifier: 'internal-skill', name: 'Internal skill' }],
    metaList: () => [
      { identifier: 'internal-tool', meta: { title: 'Internal tool' } },
      { identifier: 'internal-skill', meta: { title: 'Internal skill' } },
    ],
  },
}));

describe('selectable installed tools after Marketplace retirement', () => {
  it('offers only builtins and deduplicates builtin skills', () => {
    const { result } = renderHook(() => useInstalledSkillsAndTools());
    expect(result.current).toEqual([
      expect.objectContaining({ category: 'skill', type: 'internal-skill' }),
      expect.objectContaining({ category: 'tool', type: 'internal-tool' }),
    ]);
  });
});
