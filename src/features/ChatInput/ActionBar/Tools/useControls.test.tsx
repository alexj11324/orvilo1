/** @vitest-environment happy-dom */
import { getActivePluginIds } from '@orvilo/types';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useControls } from './useControls';

const mocks = vi.hoisted(() => ({ setPluginMode: vi.fn() }));
const config = { plugins: ['internal-tool', 'historical-thirdparty'] };
const builtin = { identifier: 'internal-tool', meta: { title: 'Internal tool' } };
const fixed = { identifier: 'task-tool', meta: { title: 'Task tool' } };
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
  }),
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('../../hooks/useAgentId', () => ({ useAgentId: () => 'saved-agent' }));
vi.mock('@/components/Avatar', () => ({ default: () => null }));
vi.mock('@lobehub/ui/icons', () => ({ SkillsIcon: () => null }));
vi.mock('./ToolItemDetailPopover', () => ({ default: () => null }));
vi.mock('@/components/Select', () => ({
  default: ({
    'aria-label': label,
    value,
    options,
    onChange,
  }: {
    'aria-label': string;
    'value': string;
    'options': { label: ReactNode; value: string }[];
    'onChange': (value: string) => void;
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) =>
    selector({ setPluginMode: mocks.setPluginMode }),
}));
vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: { getAgentPluginsById: () => () => getActivePluginIds(config.plugins) },
  agentSelectors: { getAgentConfigById: () => () => config },
  chatConfigByIdSelectors: { getSkillActivateModeById: () => () => 'auto' },
}));
vi.mock('@/store/tool', () => ({
  useToolStore: (selector: (state: unknown) => unknown) => selector({}),
}));
vi.mock('@/store/tool/selectors', () => ({
  builtinToolSelectors: {
    metaList: () => [builtin],
    metaListIncludingHidden: () => [builtin],
    fixedDisplayMetaList: () => () => [fixed],
  },
}));

describe('builtin tool controls after platform MCP retirement', () => {
  it('keeps builtin policies while excluding persisted thirdparty tools', () => {
    const { result } = renderHook(() => useControls());
    const items = result.current.marketItems;
    expect(items.map((item) => item?.key)).toEqual(['task-tool', 'internal-tool']);
    render(
      <>
        {items.map((item) =>
          item && 'label' in item ? <div key={item.key}>{item.label}</div> : null,
        )}
      </>,
    );
    fireEvent.change(screen.getByLabelText('Internal tool'), { target: { value: 'disabled' } });
    expect(mocks.setPluginMode).toHaveBeenCalledWith('internal-tool', 'disabled', 'saved-agent');
    expect(screen.getByLabelText('Task tool').querySelector('option[value="auto"]')).toBeNull();
    expect(config.plugins).toContain('historical-thirdparty');
  });
});
