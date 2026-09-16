'use client';

import { Block, Flexbox, FormGroup, Icon } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { ChevronRightIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import urlJoin from 'url-join';

import { useExpertiseOverview } from '@/features/SelfLearning/hooks';
import { useAgentStore } from '@/store/agent';

const styles = createStaticStyles(({ css, cssVar }) => ({
  row: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block: 10px;
    padding-inline: 14px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: none;
    }
  `,
}));

/**
 * 规则与经验 —— Agent 配置里的入口。
 *
 * 这里刻意不做成第二个编辑器：完整的读、改、纠正、停用、查来源都在
 * `/agent/:aid/self-evolving` 上，配置页只回答「这个 Agent 现在带着哪些规则、各管什么范围」，
 * 再把人送过去。两处都建编辑器的话，同一个 lesson 就有两条写路径。
 */
const AgentRules = memo(() => {
  const { t } = useTranslation(['setting', 'selfLearning']);
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const { data, isLoading } = useExpertiseOverview(activeAgentId ?? undefined);

  const domains = useMemo(() => data?.domains ?? [], [data]);
  const ruleCount = useMemo(
    () => domains.reduce((total, domain) => total + domain.lessons.length, 0),
    [domains],
  );

  const openPath = activeAgentId ? urlJoin('/agent', activeAgentId, 'self-evolving') : undefined;

  return (
    <FormGroup collapsible={false} gap={16} title={t('agentTab.rules')} variant={'borderless'}>
      {isLoading || domains.length === 0 ? (
        <Text type={'secondary'}>
          {isLoading ? t('agentRules.loading') : t('agentRules.empty')}
        </Text>
      ) : (
        <Block padding={0} variant={'outlined'}>
          {domains.map((domain) => (
            <div className={styles.row} key={domain.id}>
              <Flexbox gap={2} style={{ minWidth: 0 }}>
                <Text weight={500}>{domain.title}</Text>
                {/* Scope and size, in counts — the same facts the rules page leads with. */}
                <Text fontSize={12} type={'secondary'}>
                  {t('agentRules.domainMeta', {
                    habits: domain.lessons.length,
                    runs: domain.runCount,
                  })}
                </Text>
              </Flexbox>
              <Icon icon={ChevronRightIcon} size={14} style={{ opacity: 0.4 }} />
            </div>
          ))}
        </Block>
      )}
      <Flexbox horizontal align={'center'} gap={8} justify={'space-between'} wrap={'wrap'}>
        <Text fontSize={12} type={'secondary'}>
          {t('agentRules.summary', { count: ruleCount })}
        </Text>
        {openPath && (
          <Link to={openPath}>
            <Button size={'small'} type={'text'}>
              {t('agentRules.open')}
            </Button>
          </Link>
        )}
      </Flexbox>
    </FormGroup>
  );
});

AgentRules.displayName = 'AgentRules';

export default AgentRules;
