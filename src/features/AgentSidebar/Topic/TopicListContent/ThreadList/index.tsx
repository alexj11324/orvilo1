import { ThreadType } from '@orvilo/types';
import { memo } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useFetchThreads } from '@/hooks/useFetchThreads';
import { useScrollActiveThreadIntoView } from '@/hooks/useScrollActiveThreadIntoView';
import { useChatStore } from '@/store/chat';
import { threadSelectors } from '@/store/chat/selectors';

import ThreadItem from './ThreadItem';

// Cap the nested thread list so a topic with many threads doesn't push the rest
// of the topic list off-screen; the overflow scrolls within the list itself.
// ~9 rows (NavItem 36px + 1px gap).
const MAX_HEIGHT = 9 * 37;

const ThreadList = memo(({ topicId }: { topicId: string }) => {
  const threads = useChatStore(threadSelectors.getThreadsByTopic(topicId));
  const activeThreadId = useChatStore((s) => s.activeThreadId);

  useFetchThreads(topicId);

  const containerRef = useScrollActiveThreadIntoView(activeThreadId, threads?.length);

  if (!threads || threads.length === 0) return;

  return (
    <ScrollArea ref={containerRef} style={{ maxHeight: MAX_HEIGHT }}>
      <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
        {threads?.map((item, index) => (
          <ThreadItem
            id={item.id}
            index={index}
            isSubagent={item.type === ThreadType.Isolation}
            key={item.id}
            sourceMessageId={item.sourceMessageId ?? undefined}
            title={item.title}
          />
        ))}
      </div>
    </ScrollArea>
  );
});

ThreadList.displayName = 'ThreadList';

export default ThreadList;
