'use client';

import { DnaIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import urlJoin from 'url-join';

import ActionIcon from '@/components/ActionIcon';
import AsyncBoundary from '@/components/AsyncBoundary';
import type { DropdownItem } from '@/components/ItemsMenu';
import { DropdownMenu } from '@/components/ItemsMenu';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import AgentBreadcrumb from '@/features/AgentBreadcrumb';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import type { ExpertiseDomainItem } from '@/services/expertise';
import { expertiseService } from '@/services/expertise';
import { useAgentStore } from '@/store/agent';

import { useExpertiseOverview } from './hooks';
import AnchorCard from './Portrait/AnchorCard';
import DomainList from './Portrait/DomainList';
import HabitList from './Portrait/HabitList';
import TeachBox from './Portrait/TeachBox';

/**
 * 规则与经验 —— 一个 Agent 从实践里学到、或由人直接教给它的规则。
 *
 * S60 把这一页从「成长画像」改成了规则清单。画像是关于 Agent 自身的故事：习惯等级、
 * 养成曲线、温习进度、判断句式的标题。规则清单只讲事实：有哪些规则、管什么范围、从哪次
 * 实践来的、最近有没有奏效、怎么改怎么停。载体没变，还是同一批 lessons —— 变的是叙述。
 *
 * 带 :domainId 进来时收窄到一个方向；不然就是全部方向。
 */
const SelfLearning = memo(() => {
  const { t } = useTranslation('selfLearning');
  const navigate = useWorkspaceAwareNavigate();
  const { domainId } = useParams();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const [teachOpen, setTeachOpen] = useState(false);
  const [teachDomainId, setTeachDomainId] = useState<string>();

  const { data, error, mutate } = useExpertiseOverview(activeAgentId ?? undefined);
  const allDomains = useMemo(() => data?.domains ?? [], [data]);
  const scoped = useMemo(
    () => (domainId ? allDomains.filter((d) => d.id === domainId) : allDomains),
    [allDomains, domainId],
  );
  const single = scoped.length === 1;
  const current: ExpertiseDomainItem | undefined = single ? scoped[0] : undefined;
  const habits = useMemo(
    () => scoped.flatMap((d) => d.lessons.map((l) => ({ ...l, domainId: d.id }))),
    [scoped],
  );
  const runs = scoped.reduce((a, d) => a + d.runCount, 0);
  const domainTitles = useMemo(
    () => Object.fromEntries(allDomains.map((d) => [d.id, d.title])),
    [allDomains],
  );

  const teach = async (text: string) => {
    const target = teachDomainId ?? current?.id ?? scoped[0]?.id;
    if (!target) return;
    try {
      await expertiseService.teachLesson({ domainId: target, text });
      toast.success(t('habit.teach.done'));
      setTeachOpen(false);
      void mutate();
    } catch {
      toast.error(t('habit.teach.failed'));
    }
  };

  const openCreate = useCallback(() => {
    if (!activeAgentId) return;
    navigate(urlJoin('/agent', activeAgentId, 'self-evolving/new'));
  }, [activeAgentId, navigate]);

  // Dropping a direction takes its rules and practice history with it — say so before asking.
  const confirmDelete = (domain: ExpertiseDomainItem) => {
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('domain.deleteConfirm.content', {
        habits: domain.lessons.length,
        runs: domain.runCount,
      }),
      okButtonProps: { danger: true },
      okText: t('domain.deleteConfirm.ok'),
      onOk: async () => {
        try {
          await expertiseService.deleteDomain(domain.id);
          toast.success(t('domain.deleted'));
          await mutate();
          if (domainId && activeAgentId)
            navigate(urlJoin('/agent', activeAgentId, 'self-evolving'));
        } catch {
          toast.error(t('domain.deleteFailed'));
        }
      },
      title: t('domain.deleteConfirm.title', { name: domain.title }),
    });
  };

  // Deleting a direction stays in a menu: it is rare, and it takes history with it.
  const moreMenu: DropdownItem[] = current
    ? [
        {
          danger: true,
          icon: <Trash2Icon />,
          key: 'delete',
          label: t('domain.delete'),
          onClick: () => confirmDelete(current),
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full w-full">
      <NavHeader
        styles={{ left: { paddingInlineStart: 24 } }}
        left={
          activeAgentId ? (
            <AgentBreadcrumb
              agentId={activeAgentId}
              // Whenever the page is about one direction — drilled in, or the only one there
              // is — say so in the trail.
              extraItems={current ? [current.title] : undefined}
              title={
                domainId && current ? (
                  <Link to={urlJoin('/agent', activeAgentId, 'self-evolving')}>{t('title')}</Link>
                ) : (
                  t('title')
                )
              }
            />
          ) : null
        }
        right={
          activeAgentId && allDomains.length > 0 ? (
            <div className="flex gap-2">
              <Button onClick={() => setTeachOpen((v) => !v)}>
                <PlusIcon data-icon="inline-start" />
                {t('nav.teach')}
              </Button>
              {/* Starting a new direction belongs to the overview, not to one direction's page. */}
              {!domainId && (
                <Button variant="ghost" onClick={openCreate}>
                  {t('nav.newDomain')}
                </Button>
              )}
              {moreMenu.length > 0 && (
                <DropdownMenu items={moreMenu}>
                  <ActionIcon icon={MoreHorizontalIcon} title={t('domain.more')} />
                </DropdownMenu>
              )}
            </div>
          ) : null
        }
      />
      <div className="flex flex-col flex-1 w-full overflow-y-auto">
        <WideScreenContainer>
          <AsyncBoundary
            data={data}
            error={error}
            errorVariant={'page'}
            isEmpty={!error && allDomains.length === 0}
            empty={
              <div
                className="flex flex-col items-center justify-center h-full w-full"
                style={{ minHeight: '50vh' }}
              >
                <Empty style={{ maxWidth: 420 }}>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <DnaIcon />
                    </EmptyMedia>
                    <EmptyTitle>{t('empty.title')}</EmptyTitle>
                    <EmptyDescription style={{ fontSize: 13 }}>{t('empty.desc')}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="outline" onClick={openCreate}>
                      <PlusIcon data-icon="inline-start" />
                      {t('nav.newDomain')}
                    </Button>
                  </EmptyContent>
                </Empty>
              </div>
            }
            onRetry={() => mutate()}
          >
            <div className="flex flex-col gap-5" style={{ paddingBlock: '22px 64px' }}>
              {/* Counts, not a verdict: this line used to be a sentence judging how well the
                  agent had "grown" into each direction. */}
              <div className="text-muted-foreground">
                {t('domains.meta', { habits: habits.length, runs })}
              </div>

              {teachOpen && (
                <div className="flex flex-col p-3 border border-sidebar-border bg-card">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                      <div className="text-[12px] text-muted-foreground">{t('teachNew.help')}</div>
                      {!single && (
                        <div className="flex items-center gap-1.5">
                          <div className="text-[12px] text-muted-foreground">
                            {t('teachNew.domain')}
                          </div>
                          {scoped.map((d) => (
                            <Button
                              key={d.id}
                              size="sm"
                              variant={
                                (teachDomainId ?? scoped[0].id) === d.id ? 'default' : 'outline'
                              }
                              onClick={() => setTeachDomainId(d.id)}
                            >
                              {d.title}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                    <TeachBox autoFocus placeholder={t('teachNew.placeholder')} onSubmit={teach} />
                  </div>
                </div>
              )}

              {habits.length > 0 && activeAgentId && (
                <HabitList
                  agentId={activeAgentId}
                  domainTitles={single ? undefined : domainTitles}
                  habits={habits}
                  viewAllPath={
                    current
                      ? urlJoin('/agent', activeAgentId, 'self-evolving', current.id, 'experience')
                      : undefined
                  }
                  onChanged={() => void mutate()}
                />
              )}

              {current && <AnchorCard domain={current} />}

              {!single && !domainId && (
                <DomainList
                  domains={allDomains}
                  onOpen={(id) => {
                    if (!activeAgentId) return;
                    navigate(urlJoin('/agent', activeAgentId, 'self-evolving', id));
                  }}
                />
              )}
            </div>
          </AsyncBoundary>
        </WideScreenContainer>
      </div>
    </div>
  );
});

SelfLearning.displayName = 'SelfLearning';

export default SelfLearning;
