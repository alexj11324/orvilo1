'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

import type { CommandMenuWorkResult, MenuContext, PageType, SelectedAgent } from './types';
import { detectContext } from './utils/context';
import type { ValidSearchType } from './utils/queryParser';
import { parseSearchQuery } from './utils/queryParser';
import { isResultActionsPage, RESULT_ACTIONS_PAGE } from './utils/resultActions';

interface CommandMenuContextValue {
  /**
   * The task/project result the result-actions submenu is bound to. Set by
   * `openResultActions`; cleared when the last result-actions page is popped.
   */
  actionTarget: CommandMenuWorkResult | undefined;
  activeAgentId: string | undefined;
  menuContext: MenuContext;
  mounted: boolean;
  onClose: () => void;
  /**
   * Push a result's action submenu onto the page stack, remembering the
   * search that produced it so popping back restores the result list.
   */
  openResultActions: (result: CommandMenuWorkResult) => void;
  page: PageType | undefined;
  pages: PageType[];
  pathname: string | null;
  /**
   * Pop one page off the stack. Leaving the last result-actions page also
   * restores the search snapshot taken by `openResultActions`.
   */
  popPage: () => void;
  search: string;
  selectedAgent: SelectedAgent | undefined;
  setPages: Dispatch<SetStateAction<PageType[]>>;
  setSearch: (search: string) => void;
  setSelectedAgent: (agent: SelectedAgent | undefined) => void;
  setTypeFilter: (typeFilter: ValidSearchType | undefined) => void;
  setViewMode: (viewMode: MenuViewMode) => void;
  typeFilter: ValidSearchType | undefined;
  viewMode: MenuViewMode;
}

type MenuViewMode = 'default' | 'search';

const CommandMenuContext = createContext<CommandMenuContextValue | undefined>(undefined);

interface CommandMenuProviderProps {
  children: ReactNode;
  onClose: () => void;
  pathname: string | null;
}

export const CommandMenuProvider = ({ children, onClose, pathname }: CommandMenuProviderProps) => {
  const [pages, setPages] = useState<PageType[]>([]);
  const [search, setSearchState] = useState('');
  const [typeFilter, setTypeFilterState] = useState<ValidSearchType | undefined>(undefined);
  const [selectedAgent, setSelectedAgentState] = useState<SelectedAgent | undefined>(undefined);
  const [actionTarget, setActionTarget] = useState<CommandMenuWorkResult | undefined>(undefined);
  // Query captured when the result-actions submenu opened; restored on the way
  // back out so the result list the user drilled into is still there.
  const [actionReturnSearch, setActionReturnSearch] = useState<string | undefined>(undefined);

  // Memoize derived values
  const menuContext = useMemo(() => detectContext(pathname ?? '/'), [pathname]);
  const activeAgentId = useMemo(() => {
    if (menuContext !== 'agent') return undefined;
    const match = pathname?.match(/^\/agent\/([^/?]+)/);
    return match?.[1] || undefined;
  }, [menuContext, pathname]);
  const page = pages.at(-1);
  const viewMode: MenuViewMode = search.trim().length > 0 ? 'search' : 'default';

  // Memoize setters to maintain stable references
  const setSearch = useCallback((value: string) => {
    const parsedQuery = parseSearchQuery(value);

    if (parsedQuery.typeFilter) {
      setTypeFilterState(parsedQuery.typeFilter);
      setSearchState(parsedQuery.cleanQuery);
      return;
    }

    setSearchState(value);
  }, []);
  const setTypeFilter = useCallback(
    (value: ValidSearchType | undefined) => setTypeFilterState(value),
    [],
  );
  const setSelectedAgent = useCallback(
    (value: SelectedAgent | undefined) => setSelectedAgentState(value),
    [],
  );
  const setViewMode = useCallback(() => {
    // viewMode is now derived from search, this is a no-op for backwards compatibility
  }, []);

  const openResultActions = useCallback(
    (result: CommandMenuWorkResult) => {
      setActionTarget(result);
      setActionReturnSearch(search);
      setPages((prev) => [...prev, RESULT_ACTIONS_PAGE]);
    },
    [search],
  );

  const popPage = useCallback(() => {
    const next = pages.slice(0, -1);
    if (isResultActionsPage(page) && !isResultActionsPage(next.at(-1))) {
      // Leaving the result-actions stack restores the query that produced the
      // results rather than dropping to the empty main menu.
      setSearchState(actionReturnSearch ?? '');
      setActionReturnSearch(undefined);
      setActionTarget(undefined);
    }
    setPages(next);
  }, [pages, page, actionReturnSearch]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo<CommandMenuContextValue>(
    () => ({
      actionTarget,
      activeAgentId,
      menuContext,
      mounted: true, // Always true after initial render since provider only mounts on client
      onClose,
      openResultActions,
      page,
      pages,
      pathname,
      popPage,
      search,
      selectedAgent,
      setPages,
      setSearch,
      setSelectedAgent,
      setTypeFilter,
      setViewMode,
      typeFilter,
      viewMode,
    }),
    [
      actionTarget,
      activeAgentId,
      menuContext,
      onClose,
      openResultActions,
      page,
      pages,
      pathname,
      popPage,
      search,
      selectedAgent,
      setSearch,
      setSelectedAgent,
      setTypeFilter,
      setViewMode,
      typeFilter,
      viewMode,
    ],
  );

  return <CommandMenuContext value={contextValue}>{children}</CommandMenuContext>;
};

export const useCommandMenuContext = () => {
  const context = use(CommandMenuContext);
  if (context === undefined) {
    throw new Error('useCommandMenuContext must be used within a CommandMenuProvider');
  }
  return context;
};
