import { Markdown } from '@lobehub/ui';
import type { CrawlResult } from '@orvilo/types';
import type { CrawlSuccessResult } from '@orvilo/web-crawler';
import { createStaticStyles, cx } from 'antd-style';
import { CircleAlert, Copy, ExternalLink, Info } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { copyToClipboard } from '@/utils/clipboard';

import { CRAWL_CONTENT_LIMITED_COUNT } from '../../../const';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    cardBody: css`
      padding-block: 12px 8px;
      padding-inline: 16px;
    `,
    container: css`
      cursor: pointer;

      overflow: hidden;

      max-width: 360px;
      border: 1px solid ${cssVar.colorBorderSecondary};
      border-radius: 12px;

      transition: border-color 0.2s;

      :hover {
        border-color: ${cssVar.colorPrimary};
      }
    `,
    description: css`
      margin-block: 0 4px !important;
      color: ${cssVar.colorTextSecondary};
    `,
    detailsSection: css`
      padding-block: ${cssVar.paddingSM};
    `,
    externalLink: css`
      color: ${cssVar.colorPrimary};
    `,
    footer: css`
      padding: ${cssVar.paddingXS};
      border-radius: 6px;
      text-align: center;
      background-color: ${cssVar.colorFillQuaternary};
    `,
    footerText: css`
      font-size: ${cssVar.fontSizeSM};
      color: ${cssVar.colorTextTertiary} !important;
    `,
    metaInfo: css`
      display: flex;
      align-items: center;
      color: ${cssVar.colorTextSecondary};
    `,
    sliced: css`
      color: ${cssVar.colorTextQuaternary};
    `,
    title: css`
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;

      margin-block-end: 0;

      font-size: 16px;
      font-weight: bold;
    `,
    titleRow: css`
      color: ${cssVar.colorText};
    `,

    url: css`
      color: ${cssVar.colorTextTertiary};
    `,
  };
});

enum DisplayType {
  Raw = 'raw',
  Render = 'render',
}

interface PageContentProps {
  messageId: string;
  result?: CrawlResult;
}

const PageContent = memo<PageContentProps>(({ result }) => {
  const { t } = useTranslation('plugin');
  const [display, setDisplay] = useState<DisplayType>(DisplayType.Render);

  if (!result || !result.data) return undefined;

  if ('errorType' in result.data) {
    return (
      <div className={cx('flex flex-col gap-1', styles.footer)}>
        <div>
          <div className={cx('flex gap-1', styles.footerText)}>
            <span>{t('search.crawPages.meta.crawler')}</span>
            <span>{result.crawler}</span>
          </div>
        </div>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>
            <div style={{ textAlign: 'start' }}>
              {result.data.errorMessage || result.data.content}
            </div>
          </AlertTitle>
          <AlertAction>
            {
              <div style={{ maxWidth: 500, overflowX: 'scroll' }}>
                <CodeBlock code={JSON.stringify(result.data, null, 2)} language={'json'} />
              </div>
            }
          </AlertAction>
        </Alert>
      </div>
    );
  }

  const { url, title, description, content, siteName } = result.data as CrawlSuccessResult;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className={cx('flex flex-row items-center gap-6 justify-between', styles.titleRow)}>
          <div className="flex flex-col">
            <div className={styles.title}>{title || result.originalUrl}</div>
          </div>
        </div>
        {description && <div className={`line-clamp-4 ${styles.description}`}>{description}</div>}
        <div className={cx('flex flex-row items-center gap-1', styles.url)}>
          {siteName && <div>{siteName} · </div>}
          <a
            className={styles.url}
            href={url}
            rel={'nofollow'}
            style={{ display: 'flex', gap: 4 }}
            target={'_blank'}
            onClick={(event) => event.stopPropagation()}
          >
            {result.originalUrl}
            <span className="anticon" role="img">
              <ExternalLink fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          </a>
        </div>

        <div className={styles.footer}>
          <div className="flex gap-6">
            <div className={cx('flex gap-1', styles.footerText)}>
              <span>{t('search.crawPages.meta.words')}</span>
              <span>{result.data.content?.length}</span>
            </div>
            <div className={cx('flex gap-1', styles.footerText)}>
              <span>{t('search.crawPages.meta.crawler')}</span>
              <span>{result.crawler}</span>
            </div>
          </div>
        </div>
      </div>
      {content && (
        <div className="flex flex-col gap-3" style={{ paddingBlock: '0 12px' }}>
          <div className="flex flex-row justify-between">
            <ToggleGroup
              value={[display]}
              onValueChange={(value) => value[0] && setDisplay(value[0] as DisplayType)}
            >
              <ToggleGroupItem value={DisplayType.Render}>
                {t('search.crawPages.detail.preview')}
              </ToggleGroupItem>
              <ToggleGroupItem value={DisplayType.Raw}>
                {t('search.crawPages.detail.raw')}
              </ToggleGroupItem>
            </ToggleGroup>
            <Button size="icon" variant={'ghost'} onClick={() => copyToClipboard(content)}>
              <Copy size={14} />
            </Button>
          </div>
          {content.length > CRAWL_CONTENT_LIMITED_COUNT && (
            <Alert className="border-transparent bg-transparent" variant="info">
              <Info />
              <AlertTitle>
                {t('search.crawPages.detail.tooLong', {
                  characters: CRAWL_CONTENT_LIMITED_COUNT,
                })}
              </AlertTitle>
            </Alert>
          )}
          {display === DisplayType.Render ? (
            <Markdown variant={'chat'}>{content}</Markdown>
          ) : (
            <div style={{ paddingBlock: '0 12px' }}>
              {content.length < CRAWL_CONTENT_LIMITED_COUNT ? (
                content
              ) : (
                <>
                  <span>{content.slice(0, CRAWL_CONTENT_LIMITED_COUNT)}</span>
                  <span className={styles.sliced}>
                    {content.slice(CRAWL_CONTENT_LIMITED_COUNT, -1)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default PageContent;
