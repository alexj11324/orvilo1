'use client';

import { clsx, cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChatStore } from '@/store/chat';
import { threadSelectors } from '@/store/chat/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  item: 'h-8 pointer-coarse:h-11 cursor-pointer truncate rounded-(--radius-button) px-2.5 py-1.25 text-sm leading-5.5 text-foreground whitespace-nowrap transition-[background-color] duration-150 ease-[ease] hover:bg-accent motion-reduce:transition-none',
  itemActive: 'bg-selected font-semibold hover:bg-selected',
  trigger:
    'inline-flex items-center h-8 pointer-coarse:h-11 min-w-0 cursor-pointer truncate rounded-(--radius-button) border-0 bg-transparent px-1.5 py-1.25 text-sm leading-5.5 font-semibold text-foreground outline-none transition-[background-color] duration-150 ease-[ease] hover:bg-accent focus:outline-none focus:shadow-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring/50 focus-visible:outline-offset-[-1px] data-[popup-open]:bg-accent motion-reduce:transition-none',
} as const;

interface ThreadSwitcherProps {
  title: string;
}

const ThreadSwitcher = memo<ThreadSwitcherProps>(({ title }) => {
  const { t } = useTranslation('chat');
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const threads = useChatStore(threadSelectors.currentTopicThreads);
  const switchThread = useChatStore((s) => s.switchThread);

  const handleSwitch = (id: string) => {
    if (id === activeThreadId) return;
    void switchThread(id);
  };

  const content = (
    <div className="flex flex-col gap-0.5 p-1 max-h-[50vh] max-w-90 min-w-60 overflow-y-auto">
      {threads.map((thread) => (
        <div
          {...clickableProps()}
          key={thread.id}
          className={cn(
            clsx(styles.item, thread.id === activeThreadId && styles.itemActive),
            CLICKABLE_FOCUS_RING,
          )}
          onClick={() => handleSwitch(thread.id)}
        >
          {thread.title || t('thread.title')}
        </div>
      ))}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        render={<span className={styles.trigger}>{title}</span>}
      />
      <PopoverContent align="start" className="p-1" side="bottom">
        {content}
      </PopoverContent>
    </Popover>
  );
});

export default ThreadSwitcher;
