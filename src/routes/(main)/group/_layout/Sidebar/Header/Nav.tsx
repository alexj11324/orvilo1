'use client';

import { BotMessageSquareIcon, ListTodoIcon, SearchIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { usePermission } from '@/hooks/usePermission';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { isModifierClick } from '@/utils/navigation';

const Nav = memo(() => {
  const { t } = useTranslation('chat');
  const params = useActiveRouteParams();
  const groupId = params.gid;
  const issuesHref = buildWorkspaceAwarePath('/tasks', useActiveWorkspaceSlug());
  const { pathname } = useActiveLocation();
  const isProfileActive = pathname.includes('/profile');
  const router = useQueryRoute();
  const { isAgentEditable } = useServerConfigStore(featureFlagsSelectors);
  const { allowed: canEditContent } = usePermission('edit_own_content');
  const { canEditResource, isAccessResolved } = useResourceAccess('agentGroup', groupId);
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);
  const switchTopic = useChatStore((s) => s.switchTopic);

  return (
    <div className="flex flex-col px-1" style={{ gap: 1 }}>
      <NavItem
        href={issuesHref}
        icon={ListTodoIcon}
        title={t('common:tab.issues')}
        onClick={(event) => {
          if (!isModifierClick(event)) appNavigate(issuesHref, { escape: true });
        }}
      />
      {isAgentEditable && isAccessResolved && canEditContent && canEditResource && (
        <NavItem
          active={isProfileActive}
          icon={BotMessageSquareIcon}
          title={t('tab.groupProfile')}
          onClick={() => {
            switchTopic(null, { skipRefreshMessage: true });
            router.push(urlJoin('/group', groupId!, 'profile'));
          }}
        />
      )}
      <NavItem
        icon={SearchIcon}
        title={t('tab.search')}
        onClick={() => {
          toggleCommandMenu(true);
        }}
      />
    </div>
  );
});

export default Nav;
