import isEqual from 'fast-deep-equal';
import { useEffect } from 'react';

import { Markdown } from '@/components/Markdown';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors, dbMessageSelectors } from '@/store/chat/selectors';

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
  }, [clearPortalStack, message]);

  return (
    <div className="flex h-full flex-col px-2 pbs-0 pbe-3">
      {!!content && (
        <Markdown className="overflow-scroll [&>div]:pbe-10" variant={'chat'}>
          {content}
        </Markdown>
      )}
    </div>
  );
};

export default MessageDetailBody;
