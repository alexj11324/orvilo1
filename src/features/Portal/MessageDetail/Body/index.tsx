import { Markdown } from '@lobehub/ui';
import { css, cx } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { useEffect } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors, dbMessageSelectors } from '@/store/chat/selectors';

const md = css`
  overflow: scroll;

  > div {
    padding-block-end: 40px;
  }
`;

const MessageDetailBody = () => {
  const [messageDetailId, clearPortalStack] = useChatStore((s) => [
    chatPortalSelectors.messageDetailId(s),
    s.clearPortalStack,
  ]);

  const message = useChatStore(dbMessageSelectors.getDbMessageById(messageDetailId || ''), isEqual);

  const content = message?.content || '';

  useEffect(() => {
    if (!message) {
      clearPortalStack();
    }
  }, [message]);

  return (
    <div className="flex flex-col h-[100%] px-2" style={{ paddingBlock: '0 12px' }}>
      {!!content && (
        <Markdown className={cx(md)} variant={'chat'}>
          {content}
        </Markdown>
      )}
    </div>
  );
};

export default MessageDetailBody;
