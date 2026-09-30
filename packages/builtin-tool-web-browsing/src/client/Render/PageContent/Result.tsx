'use client';

import { ActionIcon, Alert, Text } from '@lobehub/ui/base-ui';
import type { CrawlErrorResult, CrawlSuccessResult } from '@orvilo/web-crawler';
import { createStaticStyles, cx } from 'antd-style';
import { ExternalLink } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';

import { WebBrowsingManifest } from '../../../manifest';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    container: css`
      overflow: hidden;
      min-width: 360px;
      max-width: 360px;
    `,

    detailsSection: css`
      padding-block: ${cssVar.paddingSM};
    `,
    externalLink: css`
      color: ${cssVar.colorTextQuaternary};

      :hover {
        color: ${cssVar.colorText};
      }
    `,
    footer: css`
      padding-block: 4px;
      padding-inline: 12px;
      background-color: ${cssVar.colorFillQuaternary};
    `,
    footerText: css`
      font-size: 12px !important;
      color: ${cssVar.colorTextTertiary} !important;
    `,
    metaInfo: css`
      display: flex;
      align-items: center;
      color: ${cssVar.colorTextSecondary};
    `,
    title: css`
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;

      margin-block-end: 0;
    `,
    titleRow: css`
      overflow: hidden;
    `,
  };
});

interface CrawlerData {
  crawler: string;
  messageId: string;
  originalUrl: string;
  result: CrawlSuccessResult | CrawlErrorResult;
}

const CrawlerResultCard = memo<CrawlerData>(({ result, messageId, crawler, originalUrl }) => {
  const { t } = useTranslation('plugin');
  const [openToolUI, togglePageContent] = useChatStore((s) => [s.openToolUI, s.togglePageContent]);

  if ('errorType' in result) {
    return (
      <div className={cx('flex flex-col gap-2', styles.footer)}>
        <Alert
          title={<div style={{ textAlign: 'start' }}>{result.errorMessage || result.content}</div>}
          type={'error'}
          variant={'borderless'}
        />
        <div>
          <div className="flex flex-col">
            <div className={cx('flex gap-1', styles.footerText)}>
              <span>{t('search.crawPages.meta.crawler')}</span>
              <span>{crawler}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { url, title, description } = result as CrawlSuccessResult;

  return (
    <div
      className={cx(
        styles.container,
        'flex flex-col justify-between rounded-md border bg-card cursor-pointer',
      )}
      onClick={() => {
        openToolUI(messageId, WebBrowsingManifest.identifier);
        togglePageContent(originalUrl);
      }}
    >
      <div className="flex flex-col gap-2 py-2 px-3">
        <div className={cx('flex flex-row items-center justify-between', styles.titleRow)}>
          <Text ellipsis>{title || originalUrl}</Text>
          <a href={url} target={'_blank'} onClick={(event) => event.stopPropagation()}>
            <ActionIcon icon={ExternalLink} size={'small'} />
          </a>
        </div>
        <Text ellipsis={{ rows: 2 }} fontSize={12} type={'secondary'}>
          {description || result.content?.slice(0, 40)}
        </Text>
      </div>
      <div className={cx('flex flex-col', styles.footer)}>
        <div className="flex gap-6">
          <div className={cx('flex gap-1', styles.footerText)}>
            <span>{t('search.crawPages.meta.words')}</span>
            <span>{result.content?.length}</span>
          </div>
          <div className={cx('flex gap-1', styles.footerText)}>
            <span>{t('search.crawPages.meta.crawler')}</span>
            <span>{crawler}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CrawlerResultCard;
