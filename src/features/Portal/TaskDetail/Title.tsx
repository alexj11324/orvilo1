import { cn } from 'cn';
import { memo } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useTaskStore } from '@/store/task';
import { oneLineEllipsis } from '@/styles';

const styles = {
  identifier:
    'shrink-0 py-px px-1.5 rounded-[4px] font-mono text-[12px] text-muted-foreground bg-accent',
};

const Title = memo(() => {
  const taskId = useChatStore(chatPortalSelectors.taskDetailId);
  const detail = useTaskStore((s) => (taskId ? s.taskDetailMap[taskId] : undefined));
  const identifier = detail?.identifier ?? taskId;
  const name = detail?.name;

  return (
    <div className="flex flex-row items-center flex-1 gap-2" style={{ minWidth: 0 }}>
      {identifier && <span className={styles.identifier}>{identifier}</span>}
      {name && (
        <div
          className={cn(oneLineEllipsis)}
          style={{ color: 'var(--foreground)', flex: 1, fontSize: 14, minWidth: 0 }}
        >
          {name}
        </div>
      )}
    </div>
  );
});

export default Title;
