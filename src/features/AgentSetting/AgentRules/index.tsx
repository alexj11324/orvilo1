'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ChevronRightIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import urlJoin from 'url-join';

import AsyncBoundary from '@/components/AsyncBoundary';
import { FormGroup } from '@/components/GroupForm';
import { buttonVariants } from '@/components/ui/button';
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
  const { data, error, isLoading, mutate } = useExpertiseOverview(activeAgentId ?? undefined);

  const domains = useMemo(() => data?.domains ?? [], [data]);
  const ruleCount = useMemo(
    () => domains.reduce((total, domain) => total + domain.lessons.length, 0),
    [domains],
  );

  const openPath = activeAgentId ? urlJoin('/agent', activeAgentId, 'self-evolving') : undefined;

  return (
    <FormGroup gap={16} title={t('agentTab.rules')} variant={'borderless'}>
      <>
        {/* A failed fetch is not "no rules" — surface it with a retry instead of
            folding it into the empty copy. */}
        <AsyncBoundary
          data={data}
          empty={<div className="text-muted-foreground">{t('agentRules.empty')}</div>}
          error={error}
          errorVariant={'block'}
          isEmpty={!error && domains.length === 0}
          isLoading={isLoading}
          loading={<div className="text-muted-foreground">{t('agentRules.loading')}</div>}
          onRetry={() => mutate()}
        >
          <div
            className="flex flex-col overflow-hidden p-0"
            style={{
              border: `1px solid ${cssVar.colorBorder}`,
              borderRadius: cssVar.borderRadiusLG,
            }}
          >
            {domains.map((domain) => {
              const content = (
                <>
                  <div className="flex flex-col gap-0.5" style={{ minWidth: 0 }}>
                    <div className="font-medium">{domain.title}</div>
                    {/* Scope and size, in counts — the same facts the rules page leads with. */}
                    <div className="text-[12px] text-muted-foreground">
                      {t('agentRules.domainMeta', {
                        habits: domain.lessons.length,
                        runs: domain.runCount,
                      })}
                    </div>
                  </div>
                  {openPath && <ChevronRightIcon size={14} style={{ opacity: 0.4 }} />}
                </>
              );

              // The chevron promises navigation, so the whole row goes to the same
              // rules page as the "open" button below (keyboard reachable).
              return openPath ? (
                <Link
                  className={`${styles.row} outline-none transition-colors hover:bg-accent focus-visible:bg-accent`}
                  key={domain.id}
                  to={openPath}
                >
                  {content}
                </Link>
              ) : (
                <div className={styles.row} key={domain.id}>
                  {content}
                </div>
              );
            })}
          </div>
        </AsyncBoundary>
        <div className="flex items-center gap-2 justify-between flex-wrap">
          <div className="text-[12px] text-muted-foreground">
            {t('agentRules.summary', { count: ruleCount })}
          </div>
          {openPath && (
            <Link className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }))} to={openPath}>
              {t('agentRules.open')}
            </Link>
          )}
        </div>
      </>
    </FormGroup>
  );
});

AgentRules.displayName = 'AgentRules';

export default AgentRules;
