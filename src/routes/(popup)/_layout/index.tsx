'use client';

import { HotkeyScopeEnum } from '@orvilo/const/hotkeys';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { type FC } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { Outlet } from 'react-router';

import ProtocolUrlHandler from '@/features/ProtocolUrlHandler';
import { useFetchActiveTopicDetail } from '@/hooks/useFetchActiveTopicDetail';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import PopupTitleBar from './TitleBar';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    background: ${cssVar.colorBgContainer};
  `,
}));

const PopupLayout: FC = () => {
  const topicTitle = useChatStore((s) => topicSelectors.currentActiveTopic(s)?.title);

  // Archived topics fall out of the sidebar list fetch — pull their detail by
  // id so the title doesn't degrade to the "new topic" placeholder.
  useFetchActiveTopicDetail();

  return (
    <HotkeysProvider initiallyActiveScopes={[HotkeyScopeEnum.Global]}>
      <div
        className={cn('flex flex-col', styles.container)}
        style={{ height: '100%', width: '100%', overflow: 'hidden' }}
      >
        <PopupTitleBar title={topicTitle} />
        <div
          className="flex flex-col flex-1"
          style={{ minHeight: 0, overflow: 'hidden', position: 'relative' }}
        >
          <Outlet />
        </div>
        <ProtocolUrlHandler />
      </div>
    </HotkeysProvider>
  );
};

export default PopupLayout;
