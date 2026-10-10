'use client';

import { DnaIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import urlJoin from 'url-join';

import AsyncBoundary from '@/components/AsyncBoundary';
import Loading from '@/components/Loading/BrandTextLoading';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import AgentBreadcrumb from '@/features/AgentBreadcrumb';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useAgentStore } from '@/store/agent';

import { useExpertiseOverview } from '../hooks';
import HabitList from '../Portrait/HabitList';

/**
 * 一个方向的全部规则。数据与概览页同源（同一份 overview），只是把范围收窄到一个方向并去掉
 * 搜索框旁边的「全部」链接 —— 这里就是那个「全部」。
 */
const ExperienceList = memo(() => {
  const { t } = useTranslation('selfLearning');
  const { domainId } = useParams();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const { data, error, isLoading, mutate } = useExpertiseOverview(activeAgentId ?? undefined);

  const domain = useMemo(
    () => data?.domains.find((d) => d.id === domainId),
    [data?.domains, domainId],
  );
  const habits = useMemo(
    () => (domain ? domain.lessons.map((l) => ({ ...l, domainId: domain.id })) : []),
    [domain],
  );
  const domainPath =
    activeAgentId && domainId
      ? urlJoin('/agent', activeAgentId, 'self-evolving', domainId)
      : undefined;

  return (
    <div className="flex flex-col h-full w-full">
      <NavHeader
        styles={{ left: { paddingInlineStart: 24 } }}
        left={
          activeAgentId ? (
            <AgentBreadcrumb
              agentId={activeAgentId}
              extraItems={[
                <Link key={'domain'} to={domainPath ?? '#'}>
                  {domain?.title ?? '…'}
                </Link>,
                t('experience.title'),
              ]}
              title={
                <Link to={urlJoin('/agent', activeAgentId, 'self-evolving')}>{t('title')}</Link>
              }
            />
          ) : null
        }
      />
      <div className="flex flex-col flex-1 w-full overflow-y-auto">
        <WideScreenContainer>
          <AsyncBoundary
            data={data}
            error={error}
            errorVariant={'page'}
            isEmpty={!error && !isLoading && !domain}
            isLoading={isLoading}
            loading={<Loading debugId={'SelfLearningExperience'} />}
            empty={
              <div
                className="flex flex-col items-center justify-center h-full w-full"
                style={{ minHeight: '50vh' }}
              >
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <DnaIcon />
                    </EmptyMedia>
                    <EmptyTitle>{t('experience.notFound')}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </div>
            }
            onRetry={() => mutate()}
          >
            {domain && activeAgentId && (
              <div className="flex flex-col gap-5" style={{ paddingBlock: '22px 64px' }}>
                <div className="flex flex-col gap-1">
                  <div className="text-[26px] font-bold">{t('experience.title')}</div>
                  <div className="text-muted-foreground">
                    {t('experience.subtitle', { count: habits.length, name: domain.title })}
                  </div>
                </div>
                {habits.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{t('experience.emptyTitle')}</EmptyTitle>
                      <EmptyDescription>{t('experience.emptyDesc')}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <HabitList
                    agentId={activeAgentId}
                    habits={habits}
                    onChanged={() => void mutate()}
                  />
                )}
              </div>
            )}
          </AsyncBoundary>
        </WideScreenContainer>
      </div>
    </div>
  );
});

ExperienceList.displayName = 'ExperienceList';

export default ExperienceList;
