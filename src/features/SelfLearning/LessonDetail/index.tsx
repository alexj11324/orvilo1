'use client';

import { Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MessagesSquare } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import urlJoin from 'url-join';

import AsyncBoundary from '@/components/AsyncBoundary';
import Loading from '@/components/Loading/BrandTextLoading';
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

const styles = createStaticStyles(({ css }) => ({
  body: css`
    overflow-y: auto;
    display: flex;
  `,
  sections: css`
    overflow: hidden;
    width: min(100%, 760px);
  `,
  sectionItem: css`
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 16px;

    padding-block: 14px;
    padding-inline: 16px;

    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  title: css`
    max-width: 880px;
    text-wrap: balance;
  `,
  hitTitle: css`
    min-width: 0;
  `,
}));

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
      <div className={cx(styles.body, 'flex flex-col flex-1 w-full')}>
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
                  <Text fontSize={12} type={'secondary'} weight={600}>
                    {t('rules.detail.eyebrow', { code: data.lesson.code })}
                  </Text>
                  <Text className={styles.title} fontSize={26} lineHeight={1.35} weight={700}>
                    {data.lesson.title}
                  </Text>
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <Text fontSize={12.5} type={'secondary'}>
                      {t('rules.detail.meta', {
                        hits: data.lesson.hitCount,
                        runs: data.lesson.hitRunCount,
                      })}
                    </Text>
                    {data.lesson.layer && <Tag>{data.lesson.layer}</Tag>}
                    {/* Only worth a tag when it is NOT active: the list only ever shows
                        active rules, so this is the stale-deep-link case. */}
                    {data.lesson.status !== 'active' && (
                      <Tag color={'orange'}>{t(`rules.detail.status.${data.lesson.status}`)}</Tag>
                    )}
                    {/* The real revision counter, not an invented version number — S60 forbids
                        faking one, and this table has the chain to back it up. */}
                    {data.lesson.currentRevision > 1 && (
                      <Text fontSize={12} type={'secondary'}>
                        {t('rules.detail.revision', { revision: data.lesson.currentRevision })}
                      </Text>
                    )}
                    <Text fontSize={12} type={'secondary'}>
                      {t('rules.detail.updatedAt', {
                        time: dayjs(data.lesson.updatedAt).fromNow(),
                      })}
                    </Text>
                  </div>
                  {domainError && (
                    <Text fontSize={12.5} type={'danger'}>
                      {t('rules.detail.domainUnavailable')} ·{' '}
                      <Text as={'button'} type={'info'} onClick={() => void mutateDomain()}>
                        {t('rules.detail.retry')}
                      </Text>
                    </Text>
                  )}
                </div>

                <div
                  className={cx(styles.sections, 'flex flex-col p-0 border')}
                  style={{
                    borderColor: cssVar.colorBorderSecondary,
                    background: cssVar.colorBgContainer,
                  }}
                >
                  {sections?.map((section) => (
                    <div className={styles.sectionItem} key={section.key}>
                      <Text fontSize={12} type={'secondary'} weight={600}>
                        <SectionLabel sectionKey={section.key} />
                      </Text>
                      <Text fontSize={14} lineHeight={1.65}>
                        {section.body}
                      </Text>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2.5">
                  <Text fontSize={15} weight={600}>
                    {t('rules.detail.examples')}
                  </Text>
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
                        className="flex flex-col gap-1.5 p-[14px] border"
                        key={`${hit.createdAt}-${index}`}
                        style={{
                          borderColor: cssVar.colorBorderSecondary,
                          background: cssVar.colorBgContainer,
                        }}
                      >
                        <div className="flex items-start gap-3 justify-between">
                          <Text className={styles.hitTitle} fontSize={13} lineHeight={1.65}>
                            {hit.example}
                          </Text>
                          <Tag color={hit.outcome === 'pass' ? 'green' : 'red'}>
                            {t(`rules.detail.outcome.${hit.outcome}`)}
                          </Tag>
                        </div>
                        {hit.note && (
                          <Text fontSize={12} type={'secondary'}>
                            {hit.note}
                          </Text>
                        )}
                        {hit.subjectType === 'topic' && activeAgentId ? (
                          <Link to={urlJoin('/agent', activeAgentId, hit.subjectId)}>
                            <div className="flex items-center gap-[5px]">
                              <MessagesSquare
                                size={13}
                                style={{ color: cssVar.colorTextSecondary }}
                              />
                              <Text fontSize={12} type={'secondary'}>
                                {hit.runTitle ?? `#${hit.runIndex}`}
                              </Text>
                            </div>
                          </Link>
                        ) : (
                          <Text fontSize={11} type={'secondary'}>
                            {hit.runTitle ?? `#${hit.runIndex}`}
                          </Text>
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
