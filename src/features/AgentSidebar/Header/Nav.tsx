'use client';

import { DnaIcon, MessageSquarePlusIcon, SearchIcon, TargetIcon } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { toast } from '@/components/toast';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { usePermission } from '@/hooks/usePermission';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useActionSWR } from '@/libs/swr';
import { topicActionKeys } from '@/libs/swr/keys';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

const Nav = memo(() => {
  const { t } = useTranslation('chat');
  const { t: tTopic } = useTranslation('topic');
  const { t: tSelfLearning } = useTranslation('selfLearning');
  const params = useActiveRouteParams();
  const agentId = params.aid;
  const { pathname } = useActiveLocation();
  const isGoalsActive = pathname.endsWith('/goals');
  // 下钻页 /self-evolving/:domainId 也算在这个入口下，否则点进去侧边栏就失焦了
  const isSelfLearningActive = pathname.includes('/self-evolving');
  const router = useQueryRoute();
  const { allowed: canCreateTopic } = usePermission('create_content');
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);
  const switchTopic = useChatStore((s) => s.switchTopic);
  const [openNewTopicOrSaveTopic] = useChatStore((s) => [s.openNewTopicOrSaveTopic]);
  const isNewTopicSendInFlight = useChatStore(topicSelectors.isNewTopicSendInFlight);
  const enableTopicAcceptance = useUserStore(labPreferSelectors.enableTopicAcceptance);
  const enableSelfLearning = useUserStore(labPreferSelectors.enableSelfLearning);

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
      {enableSelfLearning && (
        <NavItem
          active={isSelfLearningActive}
          icon={DnaIcon}
          title={tSelfLearning('title')}
          onClick={() => {
            switchTopic(null, { skipRefreshMessage: true });
            router.push(urlJoin('/agent', agentId!, 'self-evolving'));
          }}
        />
      )}
      {enableTopicAcceptance && (
        <NavItem
          active={isGoalsActive}
          icon={TargetIcon}
          title={t('goalList.title')}
          onClick={() => {
            switchTopic(null, { skipRefreshMessage: true });
            router.push(urlJoin('/agent', agentId!, 'goals'));
          }}
        />
      )}
    </div>
  );
});

export default Nav;
