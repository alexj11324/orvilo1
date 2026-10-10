'use client';

import { cn } from 'cn';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MessagesSquare } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import urlJoin from 'url-join';

import AsyncBoundary from '@/components/AsyncBoundary';
import Loading from '@/components/Loading/BrandTextLoading';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import AgentBreadcrumb from '@/features/AgentBreadcrumb';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useAgentStore } from '@/store/agent';

import { lessonSectionLabel } from '../helpers';
import { useExpertiseDomain, useExpertiseLesson } from '../hooks';

// `.fromNow()` below needs the plugin. Extending here rather than relying on `src/initialize`
// keeps the module renderable on its own — the same thing `ApiKey.tsx` and
// `AgentDocumentsGroup.tsx` do. `dayjs.extend` is idempotent.
dayjs.extend(relativeTime);

const styles = {
  body: 'flex overflow-y-auto',
  sections: 'overflow-hidden w-[min(100%,760px)]',
  sectionItem:
    'grid grid-cols-[72px_minmax(0,1fr)] gap-4 py-3.5 px-4 [&+&]:[border-block-start:1px_solid_var(--sidebar-border)]',
  title: 'max-w-[880px] text-balance',
  hitTitle: 'min-w-0',
};

/** Labels a lesson section, falling back to the raw key when no polarity declares it. */
const SectionLabel = memo<{ sectionKey: string }>(({ sectionKey }) => {
  const { t } = useTranslation('selfLearning');
  const label = lessonSectionLabel(sectionKey);
  return <>{label ? t(label) : sectionKey}</>;
});

SectionLabel.displayName = 'ExpertiseSectionLabel';

const LessonDetail = memo(() => {
  const { t } = useTranslation('selfLearning');
  const { domainId, lessonId } = useParams();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const { data: domain, error: domainError, mutate: mutateDomain } = useExpertiseDomain(domainId);
  const { data, error, isLoading, mutate } = useExpertiseLesson(lessonId);
  const domainPath =
    activeAgentId && domainId
      ? urlJoin('/agent', activeAgentId, 'self-evolving', domainId)
      : undefined;
  const experiencePath = domainPath ? urlJoin(domainPath, 'experience') : undefined;
  const sections = data?.lesson.sections.filter(
    (section) =>
      section.key !== 'rule' ||
      section.body.trim().toLocaleLowerCase() !== data.lesson.title.trim().toLocaleLowerCase(),
  );

  return (
    <div className="flex flex-col h-full w-full">
      <NavHeader
        styles={{ left: { paddingInlineStart: 24 } }}
        left={
          activeAgentId ? (
            <AgentBreadcrumb
              agentId={activeAgentId}
              title={t('title')}
              extraItems={[
                <Link key={'domain'} to={domainPath ?? '#'}>
                  {domain?.domain.title ?? '…'}
                </Link>,
                <Link key={'experience'} to={experiencePath ?? '#'}>
                  {t('experience.title')}
                </Link>,
                data?.lesson.code ?? '…',
              ]}
            />
          ) : null
        }
      />
      <div className={cn(styles.body, 'flex flex-col flex-1 w-full')}>
        <WideScreenContainer>
          <AsyncBoundary
            data={data}
            error={error}
            errorVariant={'page'}
            isEmpty={!error && !isLoading && !data}
            isLoading={isLoading}
            loading={<Loading debugId={'SelfLearningLesson'} />}
            empty={
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t('rules.detail.notFound')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            }
            onRetry={() => mutate()}
          >
            {data && (
              <div className="flex flex-col gap-5" style={{ paddingBlock: '14px 64px' }}>
                <div className="flex flex-col gap-2.5">
                  <div className="text-[12px] text-muted-foreground font-semibold">
                    {t('rules.detail.eyebrow', { code: data.lesson.code })}
                  </div>
                  <div
                    className={cn('text-[26px] font-bold', styles.title)}
                    style={{ lineHeight: 1.35 }}
                  >
                    {data.lesson.title}
                  </div>
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <div className="text-muted-foreground" style={{ fontSize: 12.5 }}>
                      {t('rules.detail.meta', {
                        hits: data.lesson.hitCount,
                        runs: data.lesson.hitRunCount,
                      })}
                    </div>
                    {data.lesson.layer && <Badge variant="secondary">{data.lesson.layer}</Badge>}
                    {/* Only worth a tag when it is NOT active: the list only ever shows
                        active rules, so this is the stale-deep-link case. */}
                    {data.lesson.status !== 'active' && (
                      <Badge variant="warning">
                        {t(`rules.detail.status.${data.lesson.status}`)}
                      </Badge>
                    )}
                    {/* The real revision counter, not an invented version number — S60 forbids
                        faking one, and this table has the chain to back it up. */}
                    {data.lesson.currentRevision > 1 && (
                      <div className="text-[12px] text-muted-foreground">
                        {t('rules.detail.revision', { revision: data.lesson.currentRevision })}
                      </div>
                    )}
                    <div className="text-[12px] text-muted-foreground">
                      {t('rules.detail.updatedAt', {
                        time: dayjs(data.lesson.updatedAt).fromNow(),
                      })}
                    </div>
                  </div>
                  {domainError && (
                    <div className="text-destructive" style={{ fontSize: 12.5 }}>
                      {t('rules.detail.domainUnavailable')} ·{' '}
                      <Button
                        className="h-auto p-0 text-info"
                        size="sm"
                        type="button"
                        variant="link"
                        onClick={() => void mutateDomain()}
                      >
                        {t('rules.detail.retry')}
                      </Button>
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    styles.sections,
                    'flex flex-col p-0 border border-sidebar-border bg-card',
                  )}
                >
                  {sections?.map((section) => (
                    <div className={styles.sectionItem} key={section.key}>
                      <div className="text-[12px] text-muted-foreground font-semibold">
                        <SectionLabel sectionKey={section.key} />
                      </div>
                      <div className="text-[14px]" style={{ lineHeight: 1.65 }}>
                        {section.body}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="text-[15px] font-semibold">{t('rules.detail.examples')}</div>
                  {data.hits.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>{t('rules.detail.noExamples')}</EmptyTitle>
                        <EmptyDescription>{t('rules.detail.noExamplesDesc')}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    data.hits.map((hit, index) => (
                      <div
                        className="flex flex-col gap-1.5 p-[14px] border border-sidebar-border bg-card"
                        key={`${hit.createdAt}-${index}`}
                      >
                        <div className="flex items-start gap-3 justify-between">
                          <div
                            className={cn('text-[13px]', styles.hitTitle)}
                            style={{ lineHeight: 1.65 }}
                          >
                            {hit.example}
                          </div>
                          <Badge variant={hit.outcome === 'pass' ? 'success' : 'destructive'}>
                            {t(`rules.detail.outcome.${hit.outcome}`)}
                          </Badge>
                        </div>
                        {hit.note && (
                          <div className="text-[12px] text-muted-foreground">{hit.note}</div>
                        )}
                        {hit.subjectType === 'topic' && activeAgentId ? (
                          <Link to={urlJoin('/agent', activeAgentId, hit.subjectId)}>
                            <div className="flex items-center gap-[5px]">
                              <MessagesSquare className="text-muted-foreground" size={13} />
                              <div className="text-[12px] text-muted-foreground">
                                {hit.runTitle ?? `#${hit.runIndex}`}
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="text-[11px] text-muted-foreground">
                            {hit.runTitle ?? `#${hit.runIndex}`}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </AsyncBoundary>
        </WideScreenContainer>
      </div>
    </div>
  );
});

LessonDetail.displayName = 'LessonDetail';

export default LessonDetail;
