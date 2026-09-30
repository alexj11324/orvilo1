'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { isUndefined } from 'es-toolkit/compat';
import { type ComponentProps, memo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Badge } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useClientDataSWR } from '@/libs/swr';
import { statsKeys } from '@/libs/swr/keys';
import { agentService } from '@/services/agent';
import { messageService } from '@/services/message';
import { topicService } from '@/services/topic';
import { useServerConfigStore } from '@/store/serverConfig';
import { formatShortenNumber } from '@/utils/format';
import { today } from '@/utils/time';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    padding-block: 6px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorFillTertiary};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  count: css`
    font-size: 16px;
    font-weight: bold;
    line-height: 1.2;
  `,
  title: css`
    font-size: 12px;
    line-height: 1.2;
    color: ${cssVar.colorTextDescription};
  `,
  today: css`
    font-size: 12px;
  `,
}));

const DataStatistics = memo<Omit<ComponentProps<'div'>, 'children'>>(({ style, ...rest }) => {
  const mobile = useServerConfigStore((s) => s.isMobile);
  // assistants (counted from the agents table — the sidebar list source of truth)
  const { data: agents, isLoading: agentsLoading } = useClientDataSWR(statsKeys.countAgents(), () =>
    agentService.countAgents(),
  );
  // topics
  const { data: topics, isLoading: topicsLoading } = useClientDataSWR(statsKeys.countTopics(), () =>
    topicService.countTopics(),
  );
  // messages
  const { data: { messages, messagesToday } = {}, isLoading: messagesLoading } = useClientDataSWR(
    statsKeys.countMessages(),
    async () => ({
      messages: await messageService.countMessages({ approximate: true }),
      // today's delta stays exact — it is small, cheap, and shown as "+N"
      messagesToday: await messageService.countMessages({
        startDate: today().format('YYYY-MM-DD'),
      }),
    }),
  );

  const { t } = useTranslation('common');

  const loading = <NeuralNetworkLoading size={20} />;

  const items = [
    {
      count: agentsLoading || isUndefined(agents) ? loading : agents,
      key: 'sessions',
      title: t('dataStatistics.sessions'),
    },
    {
      count: topicsLoading || isUndefined(topics) ? loading : topics,
      key: 'topics',
      title: t('dataStatistics.topics'),
    },
    {
      count: messagesLoading || isUndefined(messages) ? loading : messages,
      countToady: messagesToday,
      key: 'messages',
      title: t('dataStatistics.messages'),
    },
  ];

  return (
    <div
      className="flex items-center gap-1 px-2 w-full"
      style={{ marginBottom: 8, ...style }}
      {...rest}
    >
      {items.map((item) => {
        if (item.key === 'messages') {
          const showBadge = Boolean(item.countToady && item.countToady > 0);
          return (
            <div
              className={cx(styles.card, 'flex items-center gap-1 justify-between')}
              key={item.key}
              style={{ flex: showBadge && !mobile ? 2 : 1 }}
            >
              <div className="flex flex-col gap-0.5">
                <div className={styles.count}>{formatShortenNumber(item.count)}</div>
                <div className={styles.title}>{item.title}</div>
              </div>
              {showBadge && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex">
                          <Badge
                            style={{
                              background: cssVar.colorSuccess,
                              color: cssVar.colorSuccessBg,
                              cursor: 'pointer',
                            }}
                          >
                            {`+${item.countToady}`}
                          </Badge>
                        </span>
                      }
                    />
                    <TooltipContent>{t('dataStatistics.today')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          );
        }

        return (
          <div className={cx(styles.card, 'flex flex-col flex-1 gap-0.5')} key={item.key}>
            <div className="flex">
              <div className={styles.count}>{formatShortenNumber(item.count)}</div>
            </div>
            <div className={styles.title}>{item.title}</div>
          </div>
        );
      })}
    </div>
  );
});

export default DataStatistics;
