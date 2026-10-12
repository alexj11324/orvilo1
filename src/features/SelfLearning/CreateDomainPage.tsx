'use client';

import { cn } from 'cn';
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
import { useMediaQuery } from 'react-responsive';
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
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkSurface, { WorkSurfaceDocument } from '@/features/WorkSurface/WorkSurface';
import type { ExpertiseDomainDraft } from '@/services/expertise';
import { expertiseService } from '@/services/expertise';
import { useAgentStore } from '@/store/agent';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { shinyTextStyles } from '@/styles';
import { isTrpcPreconditionReason } from '@/utils/trpcError';

import { type AdjustmentTarget, mergeAdjustedBlock } from './createDomainAdjustment';
import nativeStyles from './CreateDomainPage.module.css';
import { useCreateDomainDraft } from './useCreateDomainDraft';

const GENERATION_ESTIMATE_SECONDS = 90;

/**
 * Drafting is optional model work. On a deployment with no usable model for it
 * the server answers with this stable reason — a state of the deployment, not
 * a failed attempt worth retrying.
 */
const isExpertiseUnavailable = (error: unknown) =>
  isTrpcPreconditionReason(error, 'EXPERTISE_UNAVAILABLE');

const emptyAdjustments: Record<AdjustmentTarget, string> = {
  canonEntries: '',
  domainFilter: '',
  layers: '',
  outOfScope: '',
  rationale: '',
};

const styles = {
  body: 'flex',
  content: 'pbs-4 pbe-24',
  footer: 'sticky z-2 inset-be-0 pbs-3 pbe-3 border-bs border-divider bg-card',
  head: 'pbe-6',
  generatingStatus: 'min-h-9 pbs-1.5 pbe-1.5 text-muted-foreground',
  generatingTextItem: 'flex h-5.5 items-center text-sm leading-5.5 font-normal whitespace-nowrap',
  generatingTextTrack: 'motion-reduce:animate-none',
  generatingTextViewport: 'h-5.5 overflow-hidden',
  itemRow:
    'grid grid-cols-[32px_minmax(0,1fr)_32px] items-start gap-2 pbs-2 pbe-2 border-be border-divider last:border-be-0',
  reviewSection: 'pbs-5 pbe-5 first:pbs-0 first:pbe-1',
  rationale: 'm-0 px-0 text-sm leading-5.5 text-foreground',
  seq: 'pbs-2 text-xs leading-5 text-foreground-tertiary',
  title: nativeStyles.headingInput,
  titleStatic: nativeStyles.headingStatic,
};

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
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const shouldAnimate = animationMode !== 'disabled' && !prefersReducedMotion;
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
    } catch (error) {
      if (isExpertiseUnavailable(error)) toast.info(t('create.unavailable'));
      else toast.error(t('create.failed'));
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
      } catch (error) {
        if (isExpertiseUnavailable(error)) toast.info(t('create.unavailable'));
        else toast.error(t('create.adjust.failed'));
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
            <RefreshCwIcon className="size-4" data-icon="inline-start" />
            {isRefining ? t('create.adjust.adjusting') : t('create.adjust.action')}
          </Button>
        </div>
        {isRefining && (
          <div className="text-xs text-muted-foreground">
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
              size="compact"
              variant="ghost"
            >
              <SparklesIcon className="size-4" data-icon="inline-start" />
              {t('create.adjust.blockAction')}
            </Button>
          }
        />
        <PopoverContent align="end" className={nativeStyles.adjustmentPopover} side="bottom">
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
    <WorkSurface>
      <NavHeader
        slotClassNames={{ left: 'ps-6' }}
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
      <WorkSurfaceDocument className={styles.content}>
        <div className="flex flex-col" onKeyDown={onKeyDown}>
          <div className={cn('flex flex-row', styles.head)}>
            <div className="flex flex-col flex-1 gap-1.5">
              {step === 'review' && (
                <div className="flex flex-row">
                  <Button size="normal" variant="ghost" onClick={returnToOverview}>
                    <ArrowLeftIcon className="size-4" data-icon="inline-start" />
                    {t('create.back')}
                  </Button>
                </div>
              )}
              {step === 'review' && draft ? (
                <Input
                  className={styles.title}
                  maxLength={80}
                  placeholder={t('create.field.title')}
                  value={draft.title}
                  visualSize="large"
                  onChange={(e) => patch({ title: e.target.value })}
                />
              ) : (
                <div className={styles.titleStatic}>{t('create.modalTitle')}</div>
              )}
              {step !== 'review' && (
                <>
                  <div className="text-xs text-muted-foreground">{t('create.briefHelp')}</div>
                  <GeneratingBorder generating={step === 'preparing'}>
                    <Textarea
                      autoFocus
                      className={cn('bg-secondary', step === 'preparing' && 'border-transparent')}
                      disabled={step === 'preparing'}
                      placeholder={t('create.briefPlaceholder')}
                      rows={5}
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                    />
                  </GeneratingBorder>
                  {step === 'preparing' ? (
                    <div
                      className={cn(
                        'flex flex-row items-center gap-2.5 justify-between',
                        styles.generatingStatus,
                      )}
                    >
                      <div className="flex flex-row items-center gap-2">
                        <NeuralNetworkLoading size={16} />
                        <div
                          aria-label={t('create.generating')}
                          className={styles.generatingTextViewport}
                          role={'status'}
                        >
                          <div
                            aria-hidden
                            data-slot="self-learning-generation-track"
                            className={cn(
                              styles.generatingTextTrack,
                              shouldAnimate && 'animate-self-learning-generation-roll',
                            )}
                          >
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
                      <div className="text-xs text-muted-foreground">
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
                        <SparklesIcon className="size-4" data-icon="inline-start" />
                        {t('create.generate')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {step === 'review' && draft && (
            <div className={cn('flex flex-col', styles.body)}>
              <div className={cn('flex flex-col gap-2.5', styles.reviewSection)}>
                <div className="text-sm leading-5.5 font-semibold">{t('create.field.brief')}</div>
                <Textarea
                  className={'bg-secondary'}
                  rows={3}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                />
                <div className="flex flex-row justify-end pbe-2">
                  <Button
                    disabled={!brief.trim() || !!refiningTarget}
                    size="normal"
                    onClick={() => void generate()}
                  >
                    <RefreshCwIcon className="size-4" data-icon="inline-start" />
                    {t('create.regenerate')}
                  </Button>
                </div>
              </div>
              <Separator className="m-0" />
              <div className={cn('flex flex-col gap-3', styles.reviewSection)}>
                <div className="flex flex-row items-start gap-2 justify-between">
                  <div className="text-sm text-muted-foreground">{t('create.reviewHelp')}</div>
                  <div className="flex flex-col flex-none">
                    {renderAdjustmentButton('rationale')}
                  </div>
                </div>
                <Textarea
                  className={cn(styles.rationale, 'border-transparent')}
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

              <div className={cn('flex flex-col gap-2.5', styles.reviewSection)}>
                <div className="flex flex-row items-center justify-between">
                  <div className="text-sm leading-5.5 font-semibold">
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
              <div className={cn('flex flex-col gap-2.5', styles.reviewSection)}>
                <div className="flex flex-row items-center justify-between">
                  <div className="text-sm leading-5.5 font-semibold">
                    {t('create.field.outOfScope')}
                  </div>
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

              <div className={cn('flex flex-col gap-2.5', styles.reviewSection)}>
                <div className="flex flex-row items-center gap-2 justify-between">
                  <div className="flex flex-row items-center gap-2">
                    <span className="anticon" role="img">
                      <AnchorIcon
                        className="text-foreground-tertiary"
                        fill={'transparent'}
                        height={16}
                        size={16}
                        width={16}
                      />
                    </span>
                    <div className="text-sm leading-5.5 font-semibold">
                      {t('create.anchor.canon')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('create.anchor.canonHint')}
                    </div>
                  </div>
                  <div className="flex flex-row items-center gap-1">
                    {renderAdjustmentButton('canonEntries')}
                    <Button
                      size="compact"
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
                      <PlusIcon className="size-4" data-icon="inline-start" />
                      {t('create.anchor.addCanon')}
                    </Button>
                  </div>
                </div>
                {draft.canonEntries.length === 0 && (
                  <div className="text-xs text-muted-foreground">{t('create.anchor.noCanon')}</div>
                )}
                {draft.canonEntries.map((entry, i) => (
                  <div className={styles.itemRow} key={i}>
                    <span className={styles.seq}>E{i + 1}</span>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-row gap-2">
                        <Input
                          className="flex-1 bg-secondary"
                          placeholder={t('create.anchor.canonTitle')}
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
                          className="flex-1 bg-secondary"
                          placeholder={t('create.anchor.canonSource')}
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
                      aria-label={t('delete', { ns: 'common' })}
                      icon={Trash2Icon}
                      size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                      onClick={() =>
                        patch({ canonEntries: draft.canonEntries.filter((_, j) => j !== i) })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className={cn('flex flex-col gap-2.5', styles.reviewSection)}>
                <div className="flex flex-row items-center gap-2 justify-between">
                  <div className="flex flex-row items-center gap-2">
                    <span className="anticon" role="img">
                      <LayersIcon
                        className="text-foreground-tertiary"
                        fill={'transparent'}
                        height={16}
                        size={16}
                        width={16}
                      />
                    </span>
                    <div className="text-sm leading-5.5 font-semibold">
                      {t('create.anchor.layers')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {draft.layerSource === 'canonical' && draft.layerCanonRef
                        ? t('create.anchor.layersFrom', { ref: draft.layerCanonRef })
                        : t('create.anchor.layersInvented')}
                    </div>
                  </div>
                  <div className="flex flex-row items-center gap-1">
                    {renderAdjustmentButton('layers')}
                    <Button
                      size="compact"
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
                      <PlusIcon className="size-4" data-icon="inline-start" />
                      {t('create.anchor.addLayer')}
                    </Button>
                  </div>
                </div>
                {draft.layers.length === 0 && (
                  <div className="text-xs text-muted-foreground">{t('create.anchor.noLayers')}</div>
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
                      aria-label={t('delete', { ns: 'common' })}
                      icon={Trash2Icon}
                      size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                      onClick={() => patch({ layers: draft.layers.filter((_, j) => j !== i) })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className={cn('flex flex-row items-center justify-end', styles.footer)}>
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
      </WorkSurfaceDocument>
    </WorkSurface>
  );
});

CreateDomainPage.displayName = 'CreateDomainPage';

export default CreateDomainPage;
