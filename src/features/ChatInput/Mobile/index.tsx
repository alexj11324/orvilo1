'use client';

import { ChatInput, ChatInputActionBar } from '@lobehub/editor/react';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo } from 'react';

import ChatInputNotice from '@/features/ChatInput/ChatInputNotice';
import ComposerExpandButton from '@/features/ChatInput/components/ComposerExpandButton';
import { useChatInputStore } from '@/features/ChatInput/store';
import dynamic from '@/libs/next/dynamic';

import ActionBar from '../ActionBar';
import InputEditor from '../InputEditor';
import SendArea from '../SendArea';

const FilePreview = dynamic(() => import('./FilePreview'), { ssr: false });

const styles = createStaticStyles(({ css }) => ({
  container: css``,
  fullscreen: css`
    position: absolute;
    z-index: 100;
    inset: 0;

    width: 100%;
    height: 100%;
    padding: 12px;

    background: ${cssVar.colorBgLayout};
  `,
  leftActions: css`
    flex: none;
    min-width: 0;

    > * {
      flex: none !important;
    }
  `,
  leftSlot: css`
    overflow: hidden;
    flex: 1;
    min-width: 0;
  `,
}));

const DesktopChatInput = memo(() => {
  const [slashMenuRef, expand] = useChatInputStore((s) => [s.slashMenuRef, s.expand]);
  const leftActions = useChatInputStore((s) => s.leftActions);

  const fileNode = leftActions.flat().includes('fileUpload') && <FilePreview />;

  return (
    <>
      {!expand && fileNode}
      <div
        style={{ paddingBlock: '0 12px' }}
        className={cx(
          'flex flex-col gap-2 px-3',
          cx(styles.container, expand && styles.fullscreen),
        )}
      >
        <ChatInput
          fullscreen={expand}
          slashMenuRef={slashMenuRef}
          footer={
            <ChatInputActionBar
              left={<div />}
              right={<SendArea hideContextWindow={false} />}
              style={{
                paddingRight: 8,
              }}
            />
          }
          header={
            <ChatInputActionBar
              left={
                <div className={cx('flex flex-row items-center gap-1', styles.leftSlot)}>
                  <div className="flex flex-row items-center flex-none gap-0.5">
                    <div className={cx('flex flex-row items-center', styles.leftActions)}>
                      <ActionBar disableCollapse />
                    </div>
                    <ComposerExpandButton />
                  </div>
                  <ChatInputNotice />
                </div>
              }
            />
          }
        >
          {expand && fileNode}
          <InputEditor defaultRows={1} />
        </ChatInput>
      </div>
    </>
  );
});

DesktopChatInput.displayName = 'DesktopChatInput';

export default DesktopChatInput;
