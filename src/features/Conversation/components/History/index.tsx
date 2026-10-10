import { Markdown } from '@lobehub/ui';
import { cn } from 'cn';
import { ScrollText } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelTag } from '@/components/OrviloIcons';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';
import { useAgentStore } from '@/store/agent/store';

import { contextSelectors, dataSelectors, useConversationStore } from '../../store';
import HistoryDivider from './HistoryDivider';

const styles = {
  container: 'px-3 rounded-(--radius-card)',
  content: 'text-foreground-description',
  line: 'w-0.75 h-full bg-border',
};

const History = memo(() => {
  const { t } = useTranslation('chat');
  const [content, model] = useConversationStore(() => {
    const history = dataSelectors.currentTopicSummary();
    return [history?.content, history?.model];
  });

  const agentId = useConversationStore(contextSelectors.agentId);
  const enableCompressHistory = useAgentStore(
    (s) => chatConfigByIdSelectors.getChatConfigById(agentId)(s).enableCompressHistory,
  );

  return (
    <div className="flex flex-col px-4 pb-2">
      <HistoryDivider enable />
      {enableCompressHistory && !!content && (
        <div className={cn('flex flex-col gap-2', styles.container)}>
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-center justify-center size-5">
              <ScrollText className="text-foreground-description" size={16} />
            </div>
            <div className="text-sm leading-5.5 text-muted-foreground">{t('historySummary')}</div>
            {model && (
              <div>
                <ModelTag model={model} />
              </div>
            )}
          </div>
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-center w-5 p-2">
              <div className={styles.line} />
            </div>
            <Markdown className={styles.content} variant={'chat'}>
              {content}
            </Markdown>
          </div>
        </div>
      )}
    </div>
  );
});

export default History;
