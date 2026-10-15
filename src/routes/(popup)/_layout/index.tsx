'use client';

import { HotkeyScopeEnum } from '@orvilo/const/hotkeys';
import { cn } from 'cn';
import { type FC } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { Outlet } from 'react-router';

import { useFetchActiveTopicDetail } from '@/hooks/useFetchActiveTopicDetail';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import PopupTitleBar from './TitleBar';

const styles = {
  container: 'bg-card',
};

const PopupLayout: FC = () => {
  const topicTitle = useChatStore((s) => topicSelectors.currentActiveTopic(s)?.title);

  // Archived topics fall out of the sidebar list fetch — pull their detail by
  // id so the title doesn't degrade to the "new topic" placeholder.
  useFetchActiveTopicDetail();

  return (
    <HotkeysProvider initiallyActiveScopes={[HotkeyScopeEnum.Global]}>
      <div className={cn('flex flex-col h-full w-full overflow-hidden', styles.container)}>
        <PopupTitleBar title={topicTitle} />
        <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </HotkeysProvider>
  );
};

export default PopupLayout;
