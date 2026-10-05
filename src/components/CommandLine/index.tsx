'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { CopyIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/utils/clipboard';

const styles = createStaticStyles(({ css }) => ({
  codeBlock: css`
    display: flex;
    flex: none;
    gap: 12px;
    align-items: center;

    min-width: 0;
    padding-block: 12px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorFillQuaternary};
  `,
  command: css`
    overflow-x: auto;
    flex: 1;

    min-width: 0;

    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorText};
    white-space: nowrap;
  `,
}));

interface CommandLineProps {
  command: string;
}

const CommandLine = memo<CommandLineProps>(({ command }) => {
  const { t } = useTranslation('common');
  return (
    <div className={styles.codeBlock}>
      <code className={styles.command} tabIndex={0}>
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
