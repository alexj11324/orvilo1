import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { resolveAgentListView } from './agentListView';

export function useAgentListView(itemCount: number) {
  // Direct links must own a fetch too; SWR deduplicates with the sidebar.
  const { error, isValidating, mutate } = useFetchAgentList();
  const isInit = useHomeStore(homeAgentListSelectors.isAgentListInit);
  return {
    errorProps: { error, retrying: isValidating, onRetry: () => void mutate() },
    view: resolveAgentListView({ error, isInit, itemCount }),
  };
}
