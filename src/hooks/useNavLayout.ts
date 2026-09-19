import { BotIcon, GitPullRequestIcon, InboxIcon, SquareUserIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { SidebarTabKey } from '@/store/global/initialState';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

export interface NavItem {
  hidden?: boolean;
  icon: any;
  isNew?: boolean;
  key: string;
  onClick?: () => void;
  title: string;
  url?: string;
}

export interface NavLayout {
  bottomMenuItems: NavItem[];
  footer: {
    hideGitHub: boolean;
    layout: 'expanded' | 'compact';
    showEvalEntry: boolean;
    showSettingsEntry: boolean;
  };
  topNavItems: NavItem[];
  userPanel: {
    showDataImporter: boolean;
    showMemory: boolean;
  };
}

export const useNavLayout = (): NavLayout => {
  const { t } = useTranslation('common');
  const { hideGitHub } = useServerConfigStore(featureFlagsSelectors);

  // Fixed primary IA (see features/Navigation/sidebarContract): the header
  // carries the workspace switcher + search/new-issue icons; the body renders
  // inbox/my-work/reviews/agent as core links (Agent is a flat row to /agents —
  // the old agent accordion is retired) and the accordion sections (workspace,
  // favorites, teams) separately. Retired surfaces keep their routes for deep
  // links but no sidebar entry.
  const topNavItems = useMemo(
    () =>
      [
        {
          icon: InboxIcon,
          key: SidebarTabKey.Inbox,
          title: t('tab.inbox'),
          url: '/inbox',
        },
        {
          icon: SquareUserIcon,
          key: SidebarTabKey.MyWork,
          title: t('tab.myWork'),
          url: '/my-work',
        },
        {
          icon: GitPullRequestIcon,
          key: SidebarTabKey.Reviews,
          title: t('tab.reviews'),
          url: '/my-work?tab=review',
        },
        {
          icon: BotIcon,
          key: SidebarTabKey.Agent,
          title: t('navPanel.agent'),
          url: '/agents',
        },
      ] as NavItem[],
    [t],
  );

  // Every destination that used to live here has been retired by the task-first
  // convergence: community, image/video generation, pages and the memory centre.
  //
  // They are removed rather than flagged `hidden` on purpose. HomeSidebar resolves
  // each persisted `sidebarItems` key against a map built from these two lists, so
  // an entry deleted here stops rendering even when a stored preference still names
  // it — a `hidden: true` flag would leave the key resolvable and let a stale or
  // re-synced preference bring the entry back. Preference-level retirement is
  // handled separately in the system-status normalizer.
  //
  // The list stays part of the NavLayout contract so HomeSidebar keeps one
  // resolution path for every nav key.
  const bottomMenuItems = useMemo<NavItem[]>(() => [], []);

  const footer = useMemo(
    () => ({
      hideGitHub: !!hideGitHub,
      layout: 'compact' as const,
      showEvalEntry: false,
      showSettingsEntry: true,
    }),
    [hideGitHub],
  );

  const userPanel = useMemo(
    () => ({
      showDataImporter: false,
      // The memory centre is a retired surface, so it has no entry here either —
      // the user dropdown stays focused on account / settings.
      showMemory: false,
    }),
    [],
  );

  return { bottomMenuItems, footer, topNavItems, userPanel };
};
