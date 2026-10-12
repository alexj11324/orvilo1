'use client';

import { Markdown } from '@lobehub/ui';
import { cn } from 'cn';
import { FileTextIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import CopyButton from '@/components/CopyButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';

const styles = {
  container: 'w-full overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  content: 'max-h-100 px-4 text-sm',
  header: 'border-be border-divider p-4',
  icon: 'text-muted-foreground',
  title: 'line-clamp-1 text-sm font-medium text-foreground',
};

interface DocumentCardProps {
  content: string;
  title: string;
}

const DocumentCard = memo<DocumentCardProps>(({ content, title }) => {
  const { t } = useTranslation('common');

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
        <FileTextIcon className={styles.icon} size={16} />
        <div className="flex flex-col flex-1">
          <div className={styles.title}>{title}</div>
        </div>
        <TooltipProvider>
          <CopyButton
            content={content}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={t('copy')}
          />
        </TooltipProvider>
      </div>
      <ScrollArea className={styles.content}>
        {/* Public style preserves content overflow against Markdown’s unlayered root rule. */}
        <Markdown
          className="pbe-4"
          fontSize={14}
          lineHeight={22 / 14}
          style={{ overflow: 'unset' }}
          variant={'chat'}
        >
          {content}
        </Markdown>
      </ScrollArea>
    </div>
  );
});

export default DocumentCard;
