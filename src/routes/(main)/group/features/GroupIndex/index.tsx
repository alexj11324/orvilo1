'use client';

import { MessagesSquareIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { Button } from '@/components/ui/button';
import { openCreateGroupChatModal } from '@/features/CreateGroupChat';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { usePermission } from '@/hooks/usePermission';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

const ResolvingSkeleton = createSurfaceSkeleton('list', false);

const GroupIndex = () => {
  const { t } = useTranslation('chat');
  const isLogin = useUserStore(authSelectors.isLogin);
  const { allowed: canCreate } = usePermission('create_content');
  useAgentGroupStore((s) => s.useFetchGroups)(!!isLogin, !!isLogin);
  const groups = useAgentGroupStore(agentGroupSelectors.getAllGroups);
  const groupsInit = useAgentGroupStore(agentGroupSelectors.isGroupsInitialized);
  if (!groupsInit) return <ResolvingSkeleton />;

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('group.settings.groupsTitle')}</h1>
        <Button disabled={!canCreate} onClick={() => openCreateGroupChatModal()}>
          {t('newGroupChat')}
        </Button>
      </div>
      {!groups.length && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <MessagesSquareIcon className="text-muted-foreground" size={28} />
          <p className="text-sm font-medium">{t('group.emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('group.emptyDescription')}</p>
        </div>
      )}
      {groups.map((group) => (
        <WorkspaceLink
          className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted"
          key={group.id}
          to={`/group/${group.id}`}
        >
          <MessagesSquareIcon aria-hidden size={20} />
          <span className="min-w-0 truncate text-sm">{group.title}</span>
        </WorkspaceLink>
      ))}
    </div>
  );
};

export default GroupIndex;
