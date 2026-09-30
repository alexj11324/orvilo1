'use client';

import { Skeleton } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { Copy } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { lineEllipsis, shinyTextStyles } from '@/styles';
import { copyToClipboard } from '@/utils/clipboard';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    cardBody: css`
      padding-block-start: 12px;
      padding-inline: 12px;
    `,
    container: css`
      overflow: hidden;
      justify-content: space-between;

      min-width: 360px;
      max-width: 360px;
      height: 136px;
      border: 1px solid ${cssVar.colorBorderSecondary};
      border-radius: 12px;
    `,

    footer: css`
      padding-block: 8px;
      padding-inline: 12px;

      font-size: ${cssVar.fontSizeSM};
      color: ${cssVar.colorTextTertiary};

      background-color: ${cssVar.colorFillQuaternary};
    `,
    text: cx(lineEllipsis(2), shinyTextStyles.shinyText),
  };
});

const LoadingCard = memo<{ url: string }>(({ url }) => {
  const { t } = useTranslation('plugin');

  return (
    <div className={cx('flex flex-col', styles.container)}>
      <div className={cx('flex flex-row justify-between', styles.cardBody)}>
        <a href={url} rel={'nofollow'} target={'_blank'}>
          <div className={styles.text}>{url}</div>
        </a>
        <Button size={'icon-sm'} variant={'ghost'} onClick={() => copyToClipboard(url)}>
          <Copy size={12} />
        </Button>
      </div>
      <div className="flex flex-col gap-1 px-4">
        <Skeleton height={14} width={'95%'} />
        <Skeleton height={14} width={'40%'} />
      </div>

      <div className={styles.footer}>{t('search.crawPages.crawling')}</div>
    </div>
  );
});

export default LoadingCard;
