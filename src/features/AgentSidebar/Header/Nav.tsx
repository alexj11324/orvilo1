'use client';

import { HomeIcon, ListTodoIcon, MessageSquarePlusIcon, SearchIcon } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { toast } from '@/components/toast';
import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import NavItem from '@/features/NavPanel/components/NavItem';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { usePermission } from '@/hooks/usePermission';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useActionSWR } from '@/libs/swr';
import { topicActionKeys } from '@/libs/swr/keys';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useGlobalStore } from '@/store/global';

const Nav = memo(() => {
  const { t } = useTranslation('chat');
  const { t: tTopic } = useTranslation('topic');
  const activeSlug = useActiveWorkspaceSlug();
  const homeHref = buildWorkspaceAwarePath('/', activeSlug);
  const params = useActiveRouteParams();
  const agentId = params.aid;
  const { pathname } = useActiveLocation();
  const isTasksActive = pathname.endsWith('/tasks') || pathname.includes('/task/');
  const router = useQueryRoute();
  const { allowed: canCreateTopic } = usePermission('create_content');
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);
  const switchTopic = useChatStore((s) => s.switchTopic);
  const [openNewTopicOrSaveTopic] = useChatStore((s) => [s.openNewTopicOrSaveTopic]);
  const isNewTopicSendInFlight = useChatStore(topicSelectors.isNewTopicSendInFlight);

  const { mutate } = useActionSWR(topicActionKeys.openNewOrSave(), openNewTopicOrSaveTopic);
  const latestPathname = useRef(pathname);
  latestPathname.current = pathname;
  const newTopicPending = useRef(false);
  const [isOpeningTopic, setIsOpeningTopic] = useState(false);
  const handleNewTopic = async () => {
    if (!canCreateTopic || isNewTopicSendInFlight || newTopicPending.current) return;
    newTopicPending.current = true;
    setIsOpeningTopic(true);
    try {
      // Execute against the source conversation before the route clears its
      // activeTopicId. Passing the action promise also propagates failures;
      // SWR revalidation alone resolves even when its fetcher fails.
      await mutate(openNewTopicOrSaveTopic(), { revalidate: false });
      // switchTopic's route subscriber can expose the blank composer before
      // revalidation finishes. A newer send/navigation owns the destination;
      // this late continuation must not send it back to the blank topic.
      if (
        agentId &&
        latestPathname.current === pathname &&
        !useChatStore.getState().activeTopicId
      ) {
        router.push(urlJoin('/agent', agentId));
      }
    } catch {
      toast.error(t('unknownError', { ns: 'common' }));
    } finally {
      newTopicPending.current = false;
      setIsOpeningTopic(false);
    }
  };

  return (
    <div className="flex flex-col gap-[1px]" style={{ paddingInline: 4 }}>
      <NavItem
        href={homeHref}
        icon={HomeIcon}
        title={t('tab.home')}
        onClick={() => {
          appNavigate(homeHref, { escape: true });
        }}
      />
      <NavItem
        disabled={!canCreateTopic || isNewTopicSendInFlight || isOpeningTopic}
        icon={MessageSquarePlusIcon}
        title={tTopic('actions.addNewTopic')}
        onClick={handleNewTopic}
      />
      <NavItem
        icon={SearchIcon}
        title={t('tab.search')}
        onClick={() => {
          toggleCommandMenu(true);
        }}
      />
      <NavItem
        active={isTasksActive}
        icon={ListTodoIcon}
        title={t('tab.tasks')}
        onClick={() => {
          switchTopic(null, { skipRefreshMessage: true });
          router.push(agentId ? urlJoin('/agent', agentId, 'tasks') : '/tasks');
        }}
      />
    </div>
  );
});

export default Nav;
