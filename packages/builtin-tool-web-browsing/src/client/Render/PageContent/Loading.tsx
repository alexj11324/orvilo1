'use client';

import { cn } from 'cn';
import { Copy } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { shinyTextStyles } from '@/styles';
import { copyToClipboard } from '@/utils/clipboard';

const styles = {
  cardBody: 'ps-3 pe-3 [padding-block-start:12px]',
  container:
    'overflow-hidden justify-between min-w-[360px] max-w-[360px] h-[136px] border border-sidebar-border rounded-[var(--radius-overlay)]',
  footer:
    'py-2 ps-3 pe-3 text-xs leading-[inherit] text-[var(--ant-color-text-tertiary)] bg-[var(--ant-color-fill-quaternary)]',
  text: cn('line-clamp-2 text-ellipsis', shinyTextStyles.shinyText),
};

const LoadingCard = memo<{ url: string }>(({ url }) => {
  const { t } = useTranslation('plugin');

  return (
    <div className={cn('flex flex-col', styles.container)}>
      <div className={cn('flex flex-row justify-between', styles.cardBody)}>
        <a href={url} rel={'nofollow'} target={'_blank'}>
          <div className={styles.text}>{url}</div>
        </a>
        <Button size="icon-sm" variant={'ghost'} onClick={() => copyToClipboard(url)}>
          <Copy size={12} />
        </Button>
      </div>
      <div className="flex flex-col gap-1 px-4">
        <Skeleton style={{ height: 14, width: '95%' }} />
        <Skeleton style={{ height: 14, width: '40%' }} />
      </div>

      <div className={styles.footer}>{t('search.crawPages.crawling')}</div>
    </div>
  );
});

export default LoadingCard;
