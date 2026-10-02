'use client';

import { MessagesSquareIcon, SparklesIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import urlJoin from 'url-join';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { Button } from '@/components/ui/button';
import { useCreateMenuItems } from '@/features/HomeSidebar/hooks/useCreateMenuItems';
import { openCreateAgentModal } from '@/features/HomeSidebar/hooks/useCreateModal';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useHomeStore } from '@/store/home';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

const ResolvingSkeleton = createSurfaceSkeleton('list', false);

/**
 * `/group` — the top-level Groups destination. Resolves to the most recently
 * updated group's conversation; when the account has no groups it renders a
 * compact empty state whose primary action is purpose-free creation. The
 * describe-a-purpose flow stays reachable as a secondary affordance.
 */
const GroupIndex = memo(() => {
  const { t } = useTranslation('chat');
  const isLogin = useUserStore(authSelectors.isLogin);
  useAgentGroupStore((s) => s.useFetchGroups)(!!isLogin, !!isLogin);

  const groups = useAgentGroupStore(agentGroupSelectors.getAllGroups);
  const groupsInit = useAgentGroupStore(agentGroupSelectors.isGroupsInitialized);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const sendAsGroup = useHomeStore((s) => s.sendAsGroup);
  const { createEmptyGroup, isLoading } = useCreateMenuItems();

  const targetGroupId = useMemo(() => {
    let latest: (typeof groups)[number] | undefined;
    for (const group of groups) {
      const stamp = group.updatedAt ? new Date(group.updatedAt).getTime() : 0;
      const latestStamp = latest?.updatedAt ? new Date(latest.updatedAt).getTime() : 0;
      if (!latest || stamp > latestStamp) latest = group;
    }
    return latest?.id;
  }, [groups]);

  const openGenerateModal = () => {
    openCreateAgentModal({
      agentId: inboxAgentId,
      type: 'group',
      onCreateBlank: () => createEmptyGroup(),
      onSubmit: async (prompt) => {
        await sendAsGroup({ message: prompt });
      },
    });
  };

  if (!groupsInit || targetGroupId) {
    return targetGroupId ? (
      // Relative to this index route: `/group` → `/group/:gid`, and
      // `/ws/group` → `/ws/group/:gid` in workspace scope.
      <Navigate replace to={urlJoin('..', 'group', targetGroupId)} />
    ) : (
      <ResolvingSkeleton />
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-2 p-6">
      <MessagesSquareIcon className="text-muted-foreground" size={28} />
      <div style={{ fontSize: 15, fontWeight: 500 }}>{t('group.emptyTitle')}</div>
      <div className="text-muted-foreground" style={{ fontSize: 13 }}>
        {t('group.emptyDescription')}
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
        <Button disabled={isLoading} onClick={() => createEmptyGroup()}>
          {t('newGroupChat')}
        </Button>
        <Button variant="ghost" onClick={openGenerateModal}>
          <SparklesIcon data-icon="inline-start" size={14} />
          {t('newGroupChatFromDescription')}
        </Button>
      </div>
    </div>
  );
});

GroupIndex.displayName = 'GroupIndex';

export default GroupIndex;
