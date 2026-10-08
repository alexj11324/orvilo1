'use client';

import { MessagesSquareIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import urlJoin from 'url-join';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { Button } from '@/components/ui/button';
import { openCreateGroupChatModal } from '@/features/CreateGroupChat';
import { usePermission } from '@/hooks/usePermission';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

const ResolvingSkeleton = createSurfaceSkeleton('list', false);

/**
 * `/group` — the top-level Groups destination. Resolves to the most recently
 * updated group's conversation; when the account has no groups it renders a
 * compact empty state whose only action is purpose-free creation.
 */
const GroupIndex = memo(() => {
  const { t } = useTranslation('chat');
  const isLogin = useUserStore(authSelectors.isLogin);
  useAgentGroupStore((s) => s.useFetchGroups)(!!isLogin, !!isLogin);

  const groups = useAgentGroupStore(agentGroupSelectors.getAllGroups);
  const groupsInit = useAgentGroupStore(agentGroupSelectors.isGroupsInitialized);
  const { allowed: canCreate } = usePermission('create_content');

  const targetGroupId = useMemo(() => {
    let latest: (typeof groups)[number] | undefined;
    for (const group of groups) {
      const stamp = group.updatedAt ? new Date(group.updatedAt).getTime() : 0;
      const latestStamp = latest?.updatedAt ? new Date(latest.updatedAt).getTime() : 0;
      if (!latest || stamp > latestStamp) latest = group;
    }
    return latest?.id;
  }, [groups]);

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
        <Button disabled={!canCreate} onClick={() => openCreateGroupChatModal()}>
          {t('newGroupChat')}
        </Button>
      </div>
    </div>
  );
});

GroupIndex.displayName = 'GroupIndex';

export default GroupIndex;
