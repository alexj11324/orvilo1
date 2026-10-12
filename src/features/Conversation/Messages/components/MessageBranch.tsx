import { cn } from 'cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { useConversationStore } from '../../store';

const styles = {
  button:
    "relative cursor-pointer flex items-center justify-center rounded-(--radius-button) text-muted-foreground transition-[color,background-color,opacity] duration-(--orvilo-motion-fast) enabled:hover:text-foreground enabled:hover:bg-accent disabled:opacity-40 motion-reduce:transition-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset coarse:after:absolute coarse:after:-inset-[calc(var(--spacing)*1.75)] coarse:after:content-['']",
  container:
    'select-none inline-flex gap-1 items-center h-8 coarse:h-11 px-1 rounded-(--radius-button)',
  text: 'min-w-6 h-5 text-xs leading-5 tabular-nums text-muted-foreground text-center',
};

interface MessageBranchProps {
  activeBranchIndex: number;
  count: number;
  messageId: string;
}

const MessageBranch = memo<MessageBranchProps>(({ activeBranchIndex, count, messageId }) => {
  const { t } = useTranslation('common');
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
      <span
        className={cn('inline-flex flex-none coarse:p-1.5', !canGoPrevious && 'cursor-not-allowed')}
      >
        <Button
          aria-label={t('previous')}
          className={styles.button}
          disabled={!canGoPrevious}
          size="icon"
          type="button"
          variant="ghost"
          onClick={handlePrevious}
        >
          <ChevronLeft size={16} />
        </Button>
      </span>
      <div className={cn('flex flex-col items-center justify-center', styles.text)}>
        {activeBranchIndex + 1}/{count}
      </div>
      <span
        className={cn('inline-flex flex-none coarse:p-1.5', !canGoNext && 'cursor-not-allowed')}
      >
        <Button
          aria-label={t('next')}
          className={styles.button}
          disabled={!canGoNext}
          size="icon"
          type="button"
          variant="ghost"
          onClick={handleNext}
        >
          <ChevronRight size={16} />
        </Button>
      </span>
    </div>
  );
});

export default MessageBranch;
