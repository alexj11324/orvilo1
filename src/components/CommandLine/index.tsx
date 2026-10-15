'use client';

import { CopyIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/utils/clipboard';

interface CommandLineProps {
  command: string;
}

const CommandLine = memo<CommandLineProps>(({ command }) => {
  const { t } = useTranslation('common');
  return (
    <div
      className={
        'flex flex-none items-center gap-3 min-w-0 py-3 px-4 border border-divider rounded-(--radius-card) bg-fill-quaternary'
      }
    >
      <code
        tabIndex={0}
        className={
          'overflow-x-auto flex-1 min-w-0 font-mono text-xs text-foreground whitespace-nowrap'
        }
      >
        {command}
      </code>
      <Button
        aria-label={t('copy')}
        className={'text-muted-foreground size-6'}
        size={'icon'}
        variant={'ghost'}
        onClick={async () => {
          await copyToClipboard(command);
        }}
      >
        <CopyIcon size={12} />
      </Button>
    </div>
  );
});

CommandLine.displayName = 'CommandLine';

export default CommandLine;
