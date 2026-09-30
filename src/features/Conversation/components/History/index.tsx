import { Markdown } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ScrollText } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelTag } from '@/components/OrviloIcons';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';
import { useAgentStore } from '@/store/agent/store';

import { contextSelectors, dataSelectors, useConversationStore } from '../../store';
import HistoryDivider from './HistoryDivider';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding-inline: 12px;
    border-radius: 12px;
  `,
  content: css`
    color: ${cssVar.colorTextDescription};
  `,
  line: css`
    width: 3px;
    height: 100%;
    background: ${cssVar.colorBorder};
  `,
}));

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
    <div className="flex flex-col px-4" style={{ paddingBottom: 8 }}>
      <HistoryDivider enable />
      {enableCompressHistory && !!content && (
        <div className={cn('flex flex-col gap-2', styles.container)}>
          <div className="flex items-start gap-2">
            <div className="flex items-center justify-center" style={{ height: 20, width: 20 }}>
              <ScrollText size={16} style={{ color: cssVar.colorTextDescription }} />
            </div>
            <Text type={'secondary'}>{t('historySummary')}</Text>
            {model && (
              <div>
                <ModelTag model={model} />
              </div>
            )}
          </div>
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-center p-2" style={{ width: 20 }}>
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
