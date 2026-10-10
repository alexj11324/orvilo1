import { cn } from 'cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo } from 'react';

import { useConversationStore } from '../../store';

const prefixCls = 'ant';

const styles = {
  button:
    'cursor-pointer flex items-center justify-center size-8 rounded-(--radius-button) text-muted-foreground transition-[color,background-color,opacity] duration-(--orvilo-motion-fast) [&:not(.ant-disabled):hover]:text-foreground [&:not(.ant-disabled):hover]:bg-accent [&.ant-disabled]:cursor-not-allowed [&.ant-disabled]:opacity-40 motion-reduce:transition-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
  container: 'select-none inline-flex gap-1 items-center h-8 px-1 rounded-(--radius-button)',
  text: 'min-w-6 h-5 text-xs leading-5 tabular-nums text-muted-foreground text-center',
};

interface MessageBranchProps {
  activeBranchIndex: number;
  count: number;
  messageId: string;
}

const MessageBranch = memo<MessageBranchProps>(({ activeBranchIndex, count, messageId }) => {
  const switchMessageBranch = useConversationStore((s) => s.switchMessageBranch);

  const handlePrevious = () => {
    if (activeBranchIndex > 0) {
      switchMessageBranch(messageId, activeBranchIndex - 1);
    }
  };

  const handleNext = () => {
    if (activeBranchIndex < count - 1) {
      switchMessageBranch(messageId, activeBranchIndex + 1);
    }
  };

  const canGoPrevious = activeBranchIndex > 0;
  const canGoNext = activeBranchIndex < count - 1;

  return (
    <div className={cn('flex', styles.container)}>
      <div
        className={cn(styles.button, !canGoPrevious && `${prefixCls}-disabled`)}
        role="button"
        tabIndex={canGoPrevious ? 0 : -1}
        onClick={handlePrevious}
      >
        <ChevronLeft size={16} />
      </div>
      <div className={cn('flex flex-col items-center justify-center', styles.text)}>
        {activeBranchIndex + 1}/{count}
      </div>
      <div
        className={cn(styles.button, !canGoNext && `${prefixCls}-disabled`)}
        role="button"
        tabIndex={canGoNext ? 0 : -1}
        onClick={handleNext}
      >
        <ChevronRight size={16} />
      </div>
    </div>
  );
});

export default MessageBranch;
