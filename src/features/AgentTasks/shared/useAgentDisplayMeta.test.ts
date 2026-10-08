import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';

import { useAgentDisplayMeta } from './useAgentDisplayMeta';

const initialAgentState = useAgentStore.getState();
const initialHomeState = useHomeStore.getState();

afterEach(() => {
  act(() => {
    useAgentStore.setState(initialAgentState, true);
    useHomeStore.setState(initialHomeState, true);
  });
});

describe('Agent display runtime identity', () => {
  it('keeps the runtime brand when editable name and avatar change', () => {
    act(() => {
      useAgentStore.setState({
        agentMap: {
          coder: {
            name: 'JA',
            avatar: 'JA',
            agencyConfig: { heterogeneousProvider: { type: 'codex' } },
          },
        },
      });
    });
    const { result } = renderHook(() => useAgentDisplayMeta('coder'));
    expect(result.current).toMatchObject({ runtimeType: 'codex', title: 'JA' });
    act(() => {
      useAgentStore.setState({
        agentMap: {
          coder: {
            name: 'JV',
            avatar: 'JV',
            agencyConfig: { heterogeneousProvider: { type: 'codex' } },
          },
        },
      });
    });
    expect(result.current).toMatchObject({ runtimeType: 'codex', title: 'JV' });
  });

  it.each([null, undefined])(
    'brands a known home Agent with runtime %s as Orvilo',
    (runtimeType) => {
      act(() => {
        useAgentStore.setState({ agentMap: {}, builtinAgentIdMap: {} });
        useHomeStore.setState({
          ungroupedAgents: [
            {
              id: 'normal-agent',
              heterogeneousType: runtimeType,
              name: 'JA',
              title: 'Developer',
              type: 'agent',
              pinned: false,
              updatedAt: new Date(),
            },
          ],
        });
      });
      const { result } = renderHook(() => useAgentDisplayMeta('normal-agent'));
      expect(result.current).toMatchObject({ runtimeType: 'orvilo', title: 'JA' });
      const { result: unresolved } = renderHook(() => useAgentDisplayMeta('no-access'));
      expect(unresolved.current?.runtimeType).toBeNull();
    },
  );

  it('gets an unvisited agent runtime from the home list and preserves unknown identity', () => {
    act(() => {
      useAgentStore.setState({ agentMap: {}, builtinAgentIdMap: {} });
      useHomeStore.setState({
        ungroupedAgents: [
          {
            id: 'unvisited',
            heterogeneousType: 'claude-code',
            name: 'JA',
            title: 'Reviewer',
            type: 'agent',
            pinned: false,
            updatedAt: new Date(),
          },
        ],
      });
    });
    const { result } = renderHook(() => useAgentDisplayMeta('unvisited'));
    expect(result.current).toMatchObject({ runtimeType: 'claude-code', title: 'JA' });
    const { result: unknown } = renderHook(() => useAgentDisplayMeta('inaccessible'));
    expect(unknown.current?.runtimeType).toBeNull();
  });
});
