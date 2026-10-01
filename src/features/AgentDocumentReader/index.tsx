'use client';

import { Markdown } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import ActionIcon from '@/components/ActionIcon';
import ContentLoading from '@/components/Loading/ContentLoading';
import { Button } from '@/components/ui/button';
import { agentDocumentService, agentDocumentSWRKeys } from '@/services/agentDocument';

const styles = createStaticStyles(({ css }) => ({
  article: css`
    width: 100%;
    max-width: 840px;
    margin-inline: auto;
    padding-block: 28px 80px;
    padding-inline: 20px;
  `,
  body: css`
    overflow: auto;
    flex: 1;
    min-height: 0;
  `,
  header: css`
    flex: none;

    min-height: 52px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  page: css`
    width: 100%;
    height: 100dvh;
    background: ${cssVar.colorBgContainer};
  `,
}));

interface AgentDocumentReaderProps {
  agentId: string;
  documentId: string;
}

const AgentDocumentReader = memo<AgentDocumentReaderProps>(({ agentId, documentId }) => {
  const { t } = useTranslation('common');
  const { data, error, isLoading, mutate } = useSWR(
    agentId && documentId ? agentDocumentSWRKeys.readerDocument(agentId, documentId) : null,
    () => agentDocumentService.getReaderDocument({ agentId, documentId }),
    { revalidateOnFocus: false },
  );

  const backToAgent = () => window.location.assign(`/agent/${agentId}`);
  const title = data?.title || data?.filename || '';

  return (
    <div className={cn('flex flex-col', styles.page)}>
      <div className={cn('flex flex-row items-center gap-2', styles.header)}>
        <ActionIcon icon={ArrowLeft} title={t('back')} onClick={backToAgent} />
        <div
          className="truncate block font-semibold"
          style={{ flex: 1, minWidth: 0 }}
          title={title}
        >
          {title}
        </div>
      </div>
      <div className={styles.body}>
        {!error && isLoading ? (
          <div className="flex items-center justify-center" style={{ height: '100%' }}>
            <ContentLoading />
          </div>
        ) : error ? (
          <div
            className="flex items-center justify-center gap-4"
            style={{ height: '100%', padding: 24 }}
          >
            <div className="text-muted-foreground">{error.message}</div>
            <Button
              onClick={() => {
                void mutate();
              }}
            >
              <RefreshCw data-icon="inline-start" />
              {t('retry')}
            </Button>
          </div>
        ) : (
          <article className={styles.article}>
            {data?.content ? (
              <Markdown>{data.content}</Markdown>
            ) : (
              <div className="flex items-center justify-center" style={{ padding: 64 }}>
                —
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
});

AgentDocumentReader.displayName = 'AgentDocumentReader';

export default AgentDocumentReader;
