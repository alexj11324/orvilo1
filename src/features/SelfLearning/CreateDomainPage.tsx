'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  AnchorIcon,
  ArrowLeftIcon,
  LayersIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { type KeyboardEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import urlJoin from 'url-join';

import ActionIcon from '@/components/ActionIcon';
import GeneratingBorder from '@/components/GeneratingBorder';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import AgentBreadcrumb from '@/features/AgentBreadcrumb';
import { useResolvedAgentRouteId } from '@/features/AgentRoute/useResolvedAgentRouteId';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import type { ExpertiseDomainDraft } from '@/services/expertise';
import { expertiseService } from '@/services/expertise';
import { useAgentStore } from '@/store/agent';
import { shinyTextStyles } from '@/styles';

import { type AdjustmentTarget, mergeAdjustedBlock } from './createDomainAdjustment';
import { useCreateDomainDraft } from './useCreateDomainDraft';

const GENERATION_ESTIMATE_SECONDS = 90;

const emptyAdjustments: Record<AdjustmentTarget, string> = {
  canonEntries: '',
  domainFilter: '',
  layers: '',
  outOfScope: '',
  rationale: '',
};

const styles = createStaticStyles(({ css }) => ({
  body: css`
    overflow-y: auto;
    display: flex;
  `,
  content: css`
    width: 100%;
    max-width: 960px;
    padding-block: 16px 96px;
  `,
  footer: css`
    position: sticky;
    z-index: 2;
    inset-block-end: 0;

    padding-block: 12px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  head: css`
    padding-block-end: 24px;
  `,
  generatingStatus: css`
    min-height: 36px;
    padding-block: 6px;
    color: ${cssVar.colorTextSecondary};
  `,
  generatingTextItem: css`
    display: flex;
    align-items: center;

    height: 22px;

    font-size: 14px;
    font-weight: 500;
    line-height: 22px;
    white-space: nowrap;
  `,
  generatingTextTrack: css`
    animation: self-learning-generation-roll 16s cubic-bezier(0.4, 0, 0.2, 1) infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }

    @keyframes self-learning-generation-roll {
      0%,
      20% {
        transform: translateY(0);
      }

      25%,
      45% {
        transform: translateY(-22px);
      }

      50%,
      70% {
        transform: translateY(-44px);
      }

      75%,
      95% {
        transform: translateY(-66px);
      }

      100% {
        transform: translateY(-88px);
      }
    }
  `,
  generatingTextViewport: css`
    overflow: hidden;
    height: 22px;
  `,
  itemRow: css`
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 28px;
    gap: 8px;
    align-items: start;

    padding-block: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: none;
    }
  `,
  reviewSection: css`
    padding-block: 20px;

    &:first-child {
      padding-block: 0 4px;
    }
  `,
  rationale: css`
    margin: 0;
    padding-inline: 0;

    font-size: 16px;
    line-height: 1.75;
    color: ${cssVar.colorText};
  `,
  seq: css`
    padding-block-start: 8px;
    font-size: 14px;
    color: ${cssVar.colorTextTertiary};
  `,
  title: css`
    box-sizing: border-box;
    width: 100%;
    padding-block: 4px 8px;
    padding-inline-end: 0;
    border: none;

    font-family: inherit;
    font-size: 28px;
    font-weight: 600;
    line-height: 1.4;
    color: inherit;

    background: transparent;
    outline: none;
  `,
  titleStatic: css`
    padding-block: 4px 8px;

    font-size: 28px;
    font-weight: 600;
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
}));

export const formatRemainingTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

const slugify = (s: string, fallback: string) =>
  s
    .trim()
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-|-$/g, '') || fallback;

/**
 * 两步建域，交互对齐 createGoal：① 一段话说清方向 → ② 检查它读出来的锚。
 *
 * 锚不只是名字和过滤器：分层决定经验挂在哪一层、经典依据决定「覆盖」意味着什么。
 * 这两样在落库前必须让人看见并能改 —— 所以 step 2 把整个锚候选摊开。
 */
const CreateDomainPage = memo(() => {
  const { t } = useTranslation('selfLearning');
  const navigate = useWorkspaceAwareNavigate();
  const { aid } = useParams<{ aid?: string }>();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const { agentId: routeAgentId } = useResolvedAgentRouteId(aid);
  const agentId = routeAgentId || activeAgentId;
  const { brief, clearDraft, draft, setBrief, setDraft, setStep, step, storageKey } =
    useCreateDomainDraft(agentId);
  const [creating, setCreating] = useState(false);
  const [adjustments, setAdjustments] = useState(emptyAdjustments);
  const [openAdjustment, setOpenAdjustment] = useState<AdjustmentTarget>();
  const [refiningTarget, setRefiningTarget] = useState<AdjustmentTarget>();
  const [remainingSeconds, setRemainingSeconds] = useState(GENERATION_ESTIMATE_SECONDS);

  useEffect(() => {
    if (step !== 'preparing' && !refiningTarget) return;
    setRemainingSeconds(GENERATION_ESTIMATE_SECONDS);
    const timer = window.setInterval(
      () => setRemainingSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [refiningTarget, step]);

  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (!brief.trim()) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [brief]);

  const generate = useCallback(async () => {
    if (!agentId || !brief.trim()) return;
    setStep('preparing');
    try {
      setDraft(await expertiseService.draftDomain({ agentId, brief: brief.trim() }));
      setStep('review');
    } catch {
      toast.error(t('create.failed'));
      setStep(draft ? 'review' : 'describe');
    }
  }, [agentId, brief, draft, setDraft, setStep, t]);

  const refine = useCallback(
    async (target: AdjustmentTarget) => {
      const adjustment = adjustments[target].trim();
      if (!agentId || !brief.trim() || !draft || !adjustment) return;
      setRefiningTarget(target);
      try {
        const adjusted = await expertiseService.draftDomain({
          adjustment,
          agentId,
          brief: brief.trim(),
          currentDraft: draft,
        });
        setDraft((current) => (current ? mergeAdjustedBlock(current, adjusted, target) : current));
        setAdjustments((current) => ({ ...current, [target]: '' }));
        setOpenAdjustment(undefined);
      } catch {
        toast.error(t('create.adjust.failed'));
      } finally {
        setRefiningTarget(undefined);
      }
    },
    [adjustments, agentId, brief, draft, setDraft, t],
  );

  const canCreate = !!draft && !!draft.title.trim() && !!draft.domainFilter.trim() && !creating;

  const create = useCallback(async () => {
    if (!agentId || !draft || !canCreate) return;
    setCreating(true);
    try {
      const id = await expertiseService.createDomain({
        ...draft,
        agentId,
        brief: brief.trim(),
        canonEntries: draft.canonEntries.filter((c) => c.title.trim()),
        domainFilter: draft.domainFilter.trim(),
        layers: draft.layers.filter((l) => l.title.trim()),
        outOfScope: draft.outOfScope?.trim() || null,
        rationale: draft.rationale?.trim() || null,
        title: draft.title.trim(),
      });
      if (storageKey) localStorage.removeItem(storageKey);
      navigate(urlJoin('/agent', agentId, 'self-evolving', id));
    } catch {
      toast.error(t('create.failed'));
    } finally {
      setCreating(false);
    }
  }, [agentId, brief, canCreate, draft, navigate, storageKey, t]);

  const primaryRef = useRef<() => void>(undefined);
  primaryRef.current = step === 'describe' ? generate : step === 'review' ? create : undefined;
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      void primaryRef.current?.();
    }
  }, []);
  const onAdjustmentKeyDown = useCallback(
    (target: AdjustmentTarget, e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' || (!e.metaKey && !e.ctrlKey)) return;
      e.preventDefault();
      e.stopPropagation();
      void refine(target);
    },
    [refine],
  );

  const renderAdjustmentContent = (target: AdjustmentTarget) => {
    const isRefining = refiningTarget === target;

    return (
      <div className="flex flex-col gap-2" onKeyDown={(e) => onAdjustmentKeyDown(target, e)}>
        <Textarea
          autoFocus
          className={'bg-secondary'}
          disabled={isRefining}
          placeholder={t(`create.adjust.placeholder.${target}`)}
          rows={2}
          value={adjustments[target]}
          onChange={(e) => setAdjustments((current) => ({ ...current, [target]: e.target.value }))}
        />
        <div className="flex flex-row justify-end">
          <Button
            disabled={!adjustments[target].trim() || isRefining}
            loading={isRefining}
            onClick={() => void refine(target)}
          >
            <RefreshCwIcon data-icon="inline-start" />
            {isRefining ? t('create.adjust.adjusting') : t('create.adjust.action')}
          </Button>
        </div>
        {isRefining && (
          <div className="text-[12px] text-muted-foreground">
            {remainingSeconds > 0
              ? t('create.adjust.generatingCountdown', {
                  time: formatRemainingTime(remainingSeconds),
                })
              : t('create.generatingAlmostDone')}
          </div>
        )}
      </div>
    );
  };

  const renderAdjustmentButton = (target: AdjustmentTarget) => {
    const isOpen = openAdjustment === target;
    const isRefining = refiningTarget === target;

    return (
      <Popover open={isOpen} onOpenChange={(open) => setOpenAdjustment(open ? target : undefined)}>
        <PopoverTrigger
          render={
            <Button
              aria-expanded={isOpen}
              aria-haspopup={'dialog'}
              disabled={!!refiningTarget && !isRefining}
              size="sm"
              variant="ghost"
            >
              <SparklesIcon data-icon="inline-start" />
              {t('create.adjust.blockAction')}
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-auto"
          side="bottom"
          style={{ padding: 12, width: 'min(520px, calc(100vw - 32px))' }}
        >
          {renderAdjustmentContent(target)}
        </PopoverContent>
      </Popover>
    );
  };

  const patch = (p: Partial<ExpertiseDomainDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const overviewPath = agentId ? urlJoin('/agent', agentId, 'self-evolving') : '/';
  const returnToOverview = () => {
    clearDraft();
    setAdjustments(emptyAdjustments);
    setOpenAdjustment(undefined);
    setRefiningTarget(undefined);
    navigate(overviewPath);
  };
  const generatingMessages = [
    t('create.generating'),
    t('create.generatingScope'),
    t('create.generatingCanon'),
    t('create.generatingLayers'),
    t('create.generating'),
  ];

  return (
    <div className="flex flex-col h-[100%] w-[100%]">
      <NavHeader
        styles={{ left: { paddingInlineStart: 24 } }}
        left={
          agentId ? (
            <AgentBreadcrumb
              agentId={agentId}
              extraItems={[t('create.modalTitle')]}
              title={<Link to={overviewPath}>{t('title')}</Link>}
            />
          ) : null
        }
      />
      <div className={cx('flex flex-col flex-1 w-[100%]', styles.body)}>
        <WideScreenContainer minWidth={960}>
          <div className={cx('flex flex-col', styles.content)} onKeyDown={onKeyDown}>
            <div className={cx('flex flex-row', styles.head)}>
              <div className="flex flex-col flex-1 gap-1.5">
                {step === 'review' && (
                  <div className="flex flex-row">
                    <Button size="sm" variant="ghost" onClick={returnToOverview}>
                      <ArrowLeftIcon data-icon="inline-start" />
                      {t('create.back')}
                    </Button>
                  </div>
                )}
                {step === 'review' && draft ? (
                  <input
                    className={styles.title}
                    maxLength={80}
                    placeholder={t('create.field.title')}
                    value={draft.title}
                    onChange={(e) => patch({ title: e.target.value })}
                  />
                ) : (
                  <div className={styles.titleStatic}>{t('create.modalTitle')}</div>
                )}
                {step !== 'review' && (
                  <>
                    <div className="text-[12px] text-muted-foreground">{t('create.briefHelp')}</div>
                    <GeneratingBorder generating={step === 'preparing'}>
                      <Textarea
                        autoFocus
                        className={'bg-secondary'}
                        className={step === 'preparing' ? 'border-transparent' : undefined}
                        disabled={step === 'preparing'}
                        placeholder={t('create.briefPlaceholder')}
                        rows={5}
                        value={brief}
                        onChange={(e) => setBrief(e.target.value)}
                      />
                    </GeneratingBorder>
                    {step === 'preparing' ? (
                      <div
                        className={cx(
                          'flex flex-row items-center gap-2.5 justify-between',
                          styles.generatingStatus,
                        )}
                      >
                        <div className="flex flex-row items-center gap-2">
                          <NeuralNetworkLoading size={18} />
                          <div
                            aria-label={t('create.generating')}
                            className={styles.generatingTextViewport}
                            role={'status'}
                          >
                            <div aria-hidden className={styles.generatingTextTrack}>
                              {generatingMessages.map((message, index) => (
                                <div
                                  className={`${styles.generatingTextItem} ${shinyTextStyles.shinyText}`}
                                  key={index}
                                >
                                  {message}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          {remainingSeconds > 0
                            ? t('create.generatingCountdown', {
                                time: formatRemainingTime(remainingSeconds),
                              })
                            : t('create.generatingAlmostDone')}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-row items-center justify-end">
                        <Button
                          disabled={!brief.trim()}
                          variant="outline"
                          onClick={() => void generate()}
                        >
                          <SparklesIcon data-icon="inline-start" />
                          {t('create.generate')}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {step === 'review' && draft && (
              <div className={cx('flex flex-col', styles.body)}>
                <div className={cx('flex flex-col gap-2.5', styles.reviewSection)}>
                  <div className="text-[13px] font-semibold">{t('create.field.brief')}</div>
                  <Textarea
                    className={'bg-secondary'}
                    rows={3}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                  <div className="flex flex-row justify-end" style={{ paddingBlockEnd: 8 }}>
                    <Button
                      disabled={!brief.trim() || !!refiningTarget}
                      size="sm"
                      onClick={() => void generate()}
                    >
                      <RefreshCwIcon data-icon="inline-start" />
                      {t('create.regenerate')}
                    </Button>
                  </div>
                </div>
                <Separator style={{ margin: 0 }} />
                <div className={cx('flex flex-col gap-3', styles.reviewSection)}>
                  <div className="flex flex-row items-start gap-2 justify-between">
                    <div className="text-[14px] text-muted-foreground">
                      {t('create.reviewHelp')}
                    </div>
                    <div className="flex flex-col flex-none">
                      {renderAdjustmentButton('rationale')}
                    </div>
                  </div>
                  <Textarea
                    className={cx(styles.rationale, 'border-transparent')}
                    disabled={refiningTarget === 'rationale'}
                    // An in-flight adjustment answers from the draft as it was when the
                    // request left, so edits made meanwhile would be silently overwritten
                    // when the response merges back.
                    placeholder={t('create.field.rationalePlaceholder')}
                    rows={2}
                    value={draft.rationale ?? ''}
                    onChange={(e) => patch({ rationale: e.target.value })}
                  />
                </div>

                <div className={cx('flex flex-col gap-2.5', styles.reviewSection)}>
                  <div className="flex flex-row items-center justify-between">
                    <div className="text-[13px] font-semibold">
                      {t('create.field.domainFilter')}
                    </div>
                    {renderAdjustmentButton('domainFilter')}
                  </div>
                  <Textarea
                    className={'bg-secondary'}
                    rows={2}
                    value={draft.domainFilter}
                    onChange={(e) => patch({ domainFilter: e.target.value })}
                  />
                </div>
                <div className={cx('flex flex-col gap-2.5', styles.reviewSection)}>
                  <div className="flex flex-row items-center justify-between">
                    <div className="text-[13px] font-semibold">{t('create.field.outOfScope')}</div>
                    {renderAdjustmentButton('outOfScope')}
                  </div>
                  <Textarea
                    className={'bg-secondary'}
                    placeholder={t('create.field.outOfScopePlaceholder')}
                    rows={2}
                    value={draft.outOfScope ?? ''}
                    onChange={(e) => patch({ outOfScope: e.target.value })}
                  />
                </div>

                <div className={cx('flex flex-col gap-2.5', styles.reviewSection)}>
                  <div className="flex flex-row items-center gap-2 justify-between">
                    <div className="flex flex-row items-center gap-2">
                      <span className="anticon" role="img">
                        <AnchorIcon
                          color={cssVar.colorTextTertiary}
                          fill={'transparent'}
                          height={16}
                          size={16}
                          width={16}
                        />
                      </span>
                      <div className="text-[13px] font-semibold">{t('create.anchor.canon')}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {t('create.anchor.canonHint')}
                      </div>
                    </div>
                    <div className="flex flex-row items-center gap-1">
                      {renderAdjustmentButton('canonEntries')}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch({
                            canonEntries: [
                              ...draft.canonEntries,
                              {
                                key: `canon-${draft.canonEntries.length + 1}`,
                                source: '',
                                statement: '',
                                title: '',
                              },
                            ],
                          })
                        }
                      >
                        <PlusIcon data-icon="inline-start" />
                        {t('create.anchor.addCanon')}
                      </Button>
                    </div>
                  </div>
                  {draft.canonEntries.length === 0 && (
                    <div className="text-[12px] text-muted-foreground">
                      {t('create.anchor.noCanon')}
                    </div>
                  )}
                  {draft.canonEntries.map((entry, i) => (
                    <div className={styles.itemRow} key={i}>
                      <span className={styles.seq}>E{i + 1}</span>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-row gap-2">
                          <Input
                            className={'bg-secondary'}
                            placeholder={t('create.anchor.canonTitle')}
                            style={{ flex: 1 }}
                            value={entry.title}
                            onChange={(e) =>
                              patch({
                                canonEntries: draft.canonEntries.map((c, j) =>
                                  j === i
                                    ? {
                                        ...c,
                                        key: slugify(e.target.value, c.key),
                                        title: e.target.value,
                                      }
                                    : c,
                                ),
                              })
                            }
                          />
                          <Input
                            className={'bg-secondary'}
                            placeholder={t('create.anchor.canonSource')}
                            style={{ flex: 1 }}
                            value={entry.source}
                            onChange={(e) =>
                              patch({
                                canonEntries: draft.canonEntries.map((c, j) =>
                                  j === i ? { ...c, source: e.target.value } : c,
                                ),
                              })
                            }
                          />
                        </div>
                        <Textarea
                          className={'border-transparent'}
                          placeholder={t('create.anchor.canonStatement')}
                          rows={1}
                          value={entry.statement}
                          onChange={(e) =>
                            patch({
                              canonEntries: draft.canonEntries.map((c, j) =>
                                j === i ? { ...c, statement: e.target.value } : c,
                              ),
                            })
                          }
                        />
                      </div>
                      <ActionIcon
                        icon={Trash2Icon}
                        size={'small'}
                        onClick={() =>
                          patch({ canonEntries: draft.canonEntries.filter((_, j) => j !== i) })
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className={cx('flex flex-col gap-2.5', styles.reviewSection)}>
                  <div className="flex flex-row items-center gap-2 justify-between">
                    <div className="flex flex-row items-center gap-2">
                      <span className="anticon" role="img">
                        <LayersIcon
                          color={cssVar.colorTextTertiary}
                          fill={'transparent'}
                          height={16}
                          size={16}
                          width={16}
                        />
                      </span>
                      <div className="text-[13px] font-semibold">{t('create.anchor.layers')}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {draft.layerSource === 'canonical' && draft.layerCanonRef
                          ? t('create.anchor.layersFrom', { ref: draft.layerCanonRef })
                          : t('create.anchor.layersInvented')}
                      </div>
                    </div>
                    <div className="flex flex-row items-center gap-1">
                      {renderAdjustmentButton('layers')}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch({
                            layers: [
                              ...draft.layers,
                              {
                                description: null,
                                key: `layer-${draft.layers.length + 1}`,
                                title: '',
                              },
                            ],
                          })
                        }
                      >
                        <PlusIcon data-icon="inline-start" />
                        {t('create.anchor.addLayer')}
                      </Button>
                    </div>
                  </div>
                  {draft.layers.length === 0 && (
                    <div className="text-[12px] text-muted-foreground">
                      {t('create.anchor.noLayers')}
                    </div>
                  )}
                  {draft.layers.map((layer, i) => (
                    <div className={styles.itemRow} key={i}>
                      <span className={styles.seq}>L{i + 1}</span>
                      <div className="flex flex-col gap-1">
                        <Input
                          className={'bg-secondary'}
                          placeholder={t('create.anchor.layerTitle')}
                          value={layer.title}
                          onChange={(e) =>
                            patch({
                              layers: draft.layers.map((l, j) =>
                                j === i
                                  ? {
                                      ...l,
                                      key: slugify(e.target.value, l.key),
                                      title: e.target.value,
                                    }
                                  : l,
                              ),
                            })
                          }
                        />
                        <Input
                          className={'border-transparent'}
                          placeholder={t('create.anchor.layerDesc')}
                          value={layer.description ?? ''}
                          onChange={(e) =>
                            patch({
                              layers: draft.layers.map((l, j) =>
                                j === i ? { ...l, description: e.target.value } : l,
                              ),
                            })
                          }
                        />
                      </div>
                      <ActionIcon
                        icon={Trash2Icon}
                        size={'small'}
                        onClick={() => patch({ layers: draft.layers.filter((_, j) => j !== i) })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 'review' && (
              <div className={cx('flex flex-row items-center justify-end', styles.footer)}>
                <div className="flex flex-row items-center gap-1">
                  <Button
                    disabled={!!refiningTarget || !canCreate}
                    loading={creating}
                    variant="outline"
                    onClick={() => void primaryRef.current?.()}
                  >
                    {t('create.confirm')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </WideScreenContainer>
      </div>
    </div>
  );
});

CreateDomainPage.displayName = 'CreateDomainPage';

export default CreateDomainPage;
