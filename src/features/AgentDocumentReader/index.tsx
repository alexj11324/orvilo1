'use client';

import { Markdown } from '@lobehub/ui';
import { cn } from 'cn';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import ActionIcon from '@/components/ActionIcon';
import ContentLoading from '@/components/Loading/ContentLoading';
import { Button } from '@/components/ui/button';
import { agentDocumentService, agentDocumentSWRKeys } from '@/services/agentDocument';

const styles = {
  article: 'w-full max-w-210 mx-auto [padding-block:28px_80px] px-5',
  body: 'overflow-auto flex-1 min-h-0',
  header: 'flex-none min-h-13 px-3 [border-block-end:1px_solid_var(--divider)] bg-card',
  page: 'w-full h-dvh bg-card text-sm leading-5.5',
};

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
        <ActionIcon
          icon={ArrowLeft}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
          title={t('back')}
          onClick={backToAgent}
        />
        <div
          className="truncate block flex-1 min-w-0 text-base leading-6 font-semibold text-foreground"
          title={title}
        >
          {title}
        </div>
      </div>
      <div className={styles.body}>
        {!error && isLoading ? (
          <div className="flex items-center justify-center h-full">
            <ContentLoading />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-4 h-full p-6">
            <div className="text-muted-foreground">{error.message}</div>
            <Button
              className="leading-5.5"
              size="lg"
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
              <div className="flex items-center justify-center p-16">—</div>
            )}
          </article>
        )}
      </div>
    </div>
  );
});

AgentDocumentReader.displayName = 'AgentDocumentReader';

export default AgentDocumentReader;
