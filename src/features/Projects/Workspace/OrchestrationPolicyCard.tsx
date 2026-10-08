'use client';
import type { ProjectOrchestrationPolicy } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import {
  CircleAlertIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  ShieldCheckIcon,
  XIcon,
} from 'lucide-react';
import { createElement, memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import AssigneeAgentSelector from '@/features/AgentTasks/features/AssigneeAgentSelector';
import type { ProjectDetail, ProjectOrchestrationPolicyView } from '@/store/project';
import { useProjectStore } from '@/store/project';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    border-color: ${cssVar.colorBorderSecondary};
  `,
  cardHeader: css`
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;

    @media (width <= 640px) {
      flex-direction: column;
    }
  `,
  description: css`
    color: ${cssVar.colorTextSecondary};
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  `,
  fieldLabel: css`
    font-size: ${cssVar.fontSizeSM};
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
  `,
  fieldHint: css`
    color: ${cssVar.colorTextTertiary};
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (width <= 640px) {
      grid-template-columns: 1fr;
    }
  `,
  inline: css`
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  `,
  note: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-radius: 10px;
    background: ${cssVar.colorFillQuaternary};
  `,
  section: css`
    padding-block-start: 14px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  status: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  `,
}));

interface PolicyDraft {
  coordinatorAgentId: string | null;
  orchestrationPolicy: ProjectOrchestrationPolicy;
}

interface OrchestrationPolicyCardProps {
  detail: ProjectDetail;
  projectId: string;
}

const toDraft = (view: ProjectOrchestrationPolicyView): PolicyDraft => ({
  coordinatorAgentId: view.coordinatorAgentId,
  orchestrationPolicy: {
    ...view.orchestrationPolicy,
    allowedAgentIds: view.orchestrationPolicy.allowedAgentIds
      ? [...view.orchestrationPolicy.allowedAgentIds]
      : undefined,
    allowedRoles: view.orchestrationPolicy.allowedRoles
      ? [...view.orchestrationPolicy.allowedRoles]
      : undefined,
    executionBudget: view.orchestrationPolicy.executionBudget
      ? { ...view.orchestrationPolicy.executionBudget }
      : undefined,
  },
});

const draftKey = (draft: PolicyDraft) => JSON.stringify(draft);

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const OrchestrationPolicyCard = memo<OrchestrationPolicyCardProps>(({ detail, projectId }) => {
  const { t } = useTranslation('project');
  const canManagePolicy = detail.capabilities?.canManage === true;
  const policySWR = useProjectStore((state) => state.useFetchProjectOrchestrationPolicy)(
    projectId,
    canManagePolicy,
  );
  const savePolicy = useProjectStore((state) => state.updateProjectOrchestrationPolicy);
  const addAgent = useProjectStore((state) => state.addProjectAgent);
  const removeAgent = useProjectStore((state) => state.removeProjectAgent);
  const refreshDetail = useProjectStore((state) => state.refreshProjectDetail);
  const rosterPending = useProjectStore((state) =>
    state.pendingProjectAgentIds.includes(projectId),
  );
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterRetry, setRosterRetry] = useState<(() => Promise<void>) | null>(null);
  const [draft, setDraft] = useState<PolicyDraft>();
  const [savedDraftKey, setSavedDraftKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!policySWR.data?.data || stale) return;
    const nextDraft = toDraft(policySWR.data.data);
    setDraft(nextDraft);
    setSavedDraftKey(draftKey(nextDraft));
    setSaveError(null);
  }, [policySWR.data, stale]);

  const participantOptions = useMemo(
    () =>
      (detail.agents ?? []).map(({ agent, binding }) => ({
        disabled: !binding.enabled,
        label: `${agent.name ?? agent.title ?? agent.id}${binding.role ? ` · ${binding.role}` : ''}`,
        value: agent.id,
      })),
    [detail.agents],
  );
  const roleOptions = useMemo(
    () =>
      [
        ...new Set(
          (detail.agents ?? [])
            .filter(({ binding }) => binding.enabled && binding.role)
            .map(({ binding }) => binding.role!),
        ),
      ].map((role) => ({ label: role, value: role })),
    [detail.agents],
  );

  if (!canManagePolicy) return null;

  const view = policySWR.data?.data;
  const isDirty = Boolean(draft && draftKey(draft) !== savedDraftKey);
  const humanReviewRequired = view?.requireHumanReviewRequired ?? false;

  const patchPolicy = (patch: Partial<ProjectOrchestrationPolicy>) => {
    setDraft((current) =>
      current
        ? { ...current, orchestrationPolicy: { ...current.orchestrationPolicy, ...patch } }
        : current,
    );
    setStale(false);
    setSaveError(null);
  };

  const reload = async () => {
    setStale(false);
    setSaveError(null);
    await policySWR.mutate();
  };

  const handleSave = async () => {
    if (!draft || !view || !isDirty || saving || stale) return;
    if (!draft.coordinatorAgentId) {
      setSaveError(t('orchestration.coordinatorRequired'));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await savePolicy({
        coordinatorAgentId: draft.coordinatorAgentId,
        expectedRevision: view.orchestrationPolicyRevision,
        id: projectId,
        orchestrationPolicy: draft.orchestrationPolicy,
      });
      if (result.stale) {
        setStale(true);
        return;
      }

      await policySWR.mutate({ data: result, success: true }, { revalidate: false });
      const nextDraft = toDraft(result);
      setDraft(nextDraft);
      setSavedDraftKey(draftKey(nextDraft));
      toast.success(t('orchestration.saved'));
    } catch (error) {
      setSaveError(errorMessage(error, t('orchestration.saveError')));
    } finally {
      setSaving(false);
    }
  };

  const coordinatorPickerOptions = participantOptions;
  const changeParticipant = async (agentId: string, remove = false) => {
    setRosterError(null);
    setRosterRetry(null);
    try {
      const result = await (remove ? removeAgent : addAgent)(projectId, agentId);
      if (result.refreshError) {
        setRosterError(t('orchestration.participantsRefreshError'));
        setRosterRetry(() => async () => {
          await refreshDetail(projectId);
          setRosterError(null);
          setRosterRetry(null);
        });
      }
    } catch (error) {
      setRosterError(errorMessage(error, t('orchestration.participantsSaveError')));
      setRosterRetry(() => () => changeParticipant(agentId, remove));
    }
  };
  const agentPickerOptions = participantOptions;
  const rolePickerOptions = roleOptions;
  const replanPickerOptions = [
    { label: t('orchestration.replanMode.disabled'), value: 'disabled' },
    { label: t('orchestration.replanMode.observe'), value: 'observe' },
    { label: t('orchestration.replanMode.suggest'), value: 'suggest' },
    { label: t('orchestration.replanMode.apply'), value: 'apply' },
  ];
  return (
    <section className={cn('rounded-lg border border-border bg-background', styles.card)}>
      <div className="flex flex-col" style={{ gap: 16, padding: 20 }}>
        <div className={styles.cardHeader}>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <h2 className="text-sm" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
              {t('orchestration.title')}
            </h2>
            <span className={cn('text-sm', styles.description)} style={{ fontSize: 13 }}>
              {t('orchestration.description')}
            </span>
          </div>
          <Button
            aria-busy={saving}
            disabled={!isDirty || saving || stale || !draft || rosterPending}
            variant="default"
            onClick={() => void handleSave()}
          >
            {createElement(SaveIcon, { 'size': 16, 'aria-hidden': true })}
            {saving && <Spinner />}
            {t('orchestration.save')}
          </Button>
        </div>
        {policySWR.error && (
          <Alert variant="destructive">
            <CircleAlertIcon size={16} />
            <AlertTitle>{t('orchestration.loadError')}</AlertTitle>
            <AlertDescription>
              {errorMessage(policySWR.error, t('orchestration.loadError'))}
            </AlertDescription>
            <AlertAction>
              {
                <Button variant="outline" onClick={() => void reload()}>
                  {t('orchestration.retry')}
                </Button>
              }
            </AlertAction>
          </Alert>
        )}
        {stale && (
          <Alert variant="warning">
            <AlertTitle>{t('orchestration.staleTitle')}</AlertTitle>
            <AlertDescription>{t('orchestration.staleDescription')}</AlertDescription>
            <AlertAction>
              {
                <Button variant="outline" onClick={() => void reload()}>
                  {t('orchestration.reload')}
                </Button>
              }
            </AlertAction>
          </Alert>
        )}
        {saveError && (
          <Alert variant="destructive">
            <AlertTitle>{t('orchestration.saveError')}</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
            <AlertAction>
              {
                <Button variant="outline" onClick={() => void handleSave()}>
                  {t('orchestration.retrySave')}
                </Button>
              }
            </AlertAction>
          </Alert>
        )}
        {!policySWR.error && (!draft || !view) ? (
          <div aria-busy="true" className="flex flex-col gap-3" role="status">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton className="h-4 w-full" key={index} />
            ))}
          </div>
        ) : draft && view ? (
          <>
            <div
              className={cn('flex flex-row', styles.note)}
              style={{ alignItems: 'center', gap: 10 }}
            >
              <Badge variant="secondary">
                <RefreshCwIcon size={13} />
                {t('orchestration.syncLabel')}
              </Badge>
              <span className={cn('text-sm', styles.description)} style={{ fontSize: 12 }}>
                {t('orchestration.syncDescription')}
              </span>
            </div>

            <div className={cn('flex flex-col', styles.section)} style={{ gap: 12 }}>
              <div className="flex items-center justify-between gap-4">
                <span className={styles.fieldLabel}>{t('orchestration.participantsLabel')}</span>
                <AssigneeAgentSelector
                  disabled={saving || rosterPending}
                  taskVisibility={detail.project.visibility}
                  onChange={(agentId) => {
                    if (agentId) void changeParticipant(agentId);
                  }}
                >
                  <Button disabled={saving || rosterPending} size="sm" variant="outline">
                    {rosterPending ? <Spinner /> : <PlusIcon size={16} />}
                    {t('orchestration.addParticipant')}
                  </Button>
                </AssigneeAgentSelector>
              </div>
              {(detail.agents ?? []).map(({ agent, binding }) => (
                <div className="flex items-center justify-between gap-4" key={agent.id}>
                  <span className="text-sm">{agent.name ?? agent.title ?? agent.id}</span>
                  {!binding.enabled ? (
                    <Button
                      disabled={saving || rosterPending}
                      size="sm"
                      variant="outline"
                      onClick={() => void changeParticipant(agent.id)}
                    >
                      {t('orchestration.enableParticipant')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      title={t('orchestration.removeParticipantHint')}
                      variant="ghost"
                      aria-label={t('orchestration.removeParticipant', {
                        agent: agent.name ?? agent.title ?? agent.id,
                      })}
                      disabled={
                        saving ||
                        rosterPending ||
                        agent.id === view.coordinatorAgentId ||
                        agent.id === draft.coordinatorAgentId ||
                        view.orchestrationPolicy.allowedAgentIds?.includes(agent.id) ||
                        draft.orchestrationPolicy.allowedAgentIds?.includes(agent.id)
                      }
                      onClick={() => void changeParticipant(agent.id, true)}
                    >
                      <XIcon size={16} />
                    </Button>
                  )}
                </div>
              ))}
              {rosterError && (
                <Alert variant="destructive">
                  <AlertDescription>{rosterError}</AlertDescription>
                  <AlertAction>
                    <Button
                      disabled={rosterPending}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void rosterRetry?.().catch((error) =>
                          setRosterError(
                            errorMessage(error, t('orchestration.participantsRefreshError')),
                          ),
                        )
                      }
                    >
                      {t('orchestration.retry')}
                    </Button>
                  </AlertAction>
                </Alert>
              )}
              <div className={cn('flex flex-col', styles.grid)} style={{ gap: 12 }}>
                <div className={styles.field}>
                  <span className={cn('text-sm', styles.fieldLabel)}>
                    {t('orchestration.coordinatorLabel')}
                  </span>
                  <Select
                    disabled={saving}
                    items={coordinatorPickerOptions}
                    value={(draft.coordinatorAgentId || undefined) ?? null}
                    onValueChange={(value) => {
                      if (value === null) return;
                      setDraft((current) =>
                        current ? { ...current, coordinatorAgentId: value } : current,
                      );
                      setStale(false);
                      setSaveError(null);
                    }}
                  >
                    <SelectTrigger className={'w-full'} size="sm">
                      <SelectValue placeholder={t('orchestration.coordinatorPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {coordinatorPickerOptions.map((option) => (
                        <SelectItem
                          disabled={'disabled' in option && option.disabled === true}
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className={cn('text-sm', styles.fieldHint)} style={{ fontSize: 12 }}>
                    {t('orchestration.coordinatorHint')}
                  </span>
                </div>
                <div className={styles.field}>
                  <span className={cn('text-sm', styles.fieldLabel)}>
                    {t('orchestration.allowedAgentsLabel')}
                  </span>
                  <Combobox
                    multiple
                    disabled={saving}
                    items={agentPickerOptions.map((option) => option.value)}
                    value={draft.orchestrationPolicy.allowedAgentIds ?? []}
                    itemToStringLabel={(value) => {
                      const option = agentPickerOptions.find((option) => option.value === value);
                      return option && 'title' in option && typeof option.title === 'string'
                        ? option.title
                        : typeof option?.label === 'string'
                          ? option.label
                          : String(value);
                    }}
                    onValueChange={(value) => {
                      patchPolicy({ allowedAgentIds: value as string[] });
                    }}
                  >
                    <>
                      <ComboboxChips className={'w-full'}>
                        {(draft.orchestrationPolicy.allowedAgentIds ?? []).map((value) => (
                          <ComboboxChip key={value}>
                            {agentPickerOptions.find((option) => option.value === value)?.label ??
                              String(value)}
                          </ComboboxChip>
                        ))}
                        <ComboboxChipsInput
                          aria-label={t('orchestration.allowedAgentsPlaceholder')}
                          disabled={saving}
                          placeholder={t('orchestration.allowedAgentsPlaceholder')}
                        />
                        <ComboboxClear aria-label={t('reset', { ns: 'common' })} />
                      </ComboboxChips>
                      <ComboboxContent className="min-w-56">
                        <ComboboxEmpty>{t('orchestration.allowedAgentsPlaceholder')}</ComboboxEmpty>
                        <ComboboxList>
                          {(value: (typeof agentPickerOptions)[number]['value']) => {
                            const option = agentPickerOptions.find(
                              (option) => option.value === value,
                            );
                            return (
                              <ComboboxItem
                                key={value}
                                value={value}
                                disabled={
                                  !!option && 'disabled' in option && option.disabled === true
                                }
                              >
                                {option?.label}
                              </ComboboxItem>
                            );
                          }}
                        </ComboboxList>
                      </ComboboxContent>
                    </>
                  </Combobox>
                  <span className={cn('text-sm', styles.fieldHint)} style={{ fontSize: 12 }}>
                    {t('orchestration.allowedAgentsHint')}
                  </span>
                </div>
                <div className={styles.field}>
                  <span className={cn('text-sm', styles.fieldLabel)}>
                    {t('orchestration.allowedRolesLabel')}
                  </span>
                  <Combobox
                    multiple
                    disabled={saving}
                    items={rolePickerOptions.map((option) => option.value)}
                    value={draft.orchestrationPolicy.allowedRoles ?? []}
                    itemToStringLabel={(value) => {
                      const option = rolePickerOptions.find((option) => option.value === value);
                      return option && 'title' in option && typeof option.title === 'string'
                        ? option.title
                        : typeof option?.label === 'string'
                          ? option.label
                          : String(value);
                    }}
                    onValueChange={(value) => {
                      patchPolicy({ allowedRoles: value as string[] });
                    }}
                  >
                    <>
                      <ComboboxChips className={'w-full'}>
                        {(draft.orchestrationPolicy.allowedRoles ?? []).map((value) => (
                          <ComboboxChip key={value}>
                            {rolePickerOptions.find((option) => option.value === value)?.label ??
                              String(value)}
                          </ComboboxChip>
                        ))}
                        <ComboboxChipsInput
                          aria-label={t('orchestration.allowedRolesPlaceholder')}
                          disabled={saving}
                          placeholder={t('orchestration.allowedRolesPlaceholder')}
                        />
                        <ComboboxClear aria-label={t('reset', { ns: 'common' })} />
                      </ComboboxChips>
                      <ComboboxContent className="min-w-56">
                        <ComboboxEmpty>{t('orchestration.allowedRolesPlaceholder')}</ComboboxEmpty>
                        <ComboboxList>
                          {(value: (typeof rolePickerOptions)[number]['value']) => {
                            const option = rolePickerOptions.find(
                              (option) => option.value === value,
                            );
                            return (
                              <ComboboxItem
                                key={value}
                                value={value}
                                disabled={
                                  !!option && 'disabled' in option && option.disabled === true
                                }
                              >
                                {option?.label}
                              </ComboboxItem>
                            );
                          }}
                        </ComboboxList>
                      </ComboboxContent>
                    </>
                  </Combobox>
                  <span className={cn('text-sm', styles.fieldHint)} style={{ fontSize: 12 }}>
                    {t('orchestration.allowedRolesHint')}
                  </span>
                </div>
                <div className={styles.field}>
                  <span className={cn('text-sm', styles.fieldLabel)}>
                    {t('orchestration.replanModeLabel')}
                  </span>
                  <Select
                    disabled={saving}
                    items={replanPickerOptions}
                    value={draft.orchestrationPolicy.replanMode ?? null}
                    onValueChange={(value) => {
                      if (value === null) return;
                      patchPolicy({
                        replanMode: value as ProjectOrchestrationPolicy['replanMode'],
                      });
                    }}
                  >
                    <SelectTrigger className={'w-full'} size="sm">
                      <SelectValue placeholder={undefined} />
                    </SelectTrigger>
                    <SelectContent>
                      {replanPickerOptions.map((option) => (
                        <SelectItem
                          disabled={'disabled' in option && option.disabled === true}
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.field}>
                  <span className={cn('text-sm', styles.fieldLabel)}>
                    {t('orchestration.maxPlanningRevisionsLabel')}
                  </span>
                  <Input
                    disabled={saving}
                    min={1}
                    step="any"
                    style={{ width: '100%' }}
                    type="number"
                    value={draft.orchestrationPolicy.planningBudget?.maxRevisions ?? ''}
                    onChange={(event) => {
                      const value =
                        event.target.value === '' || !Number.isFinite(event.target.valueAsNumber)
                          ? null
                          : event.target.valueAsNumber;
                      patchPolicy({
                        planningBudget: {
                          ...draft.orchestrationPolicy.planningBudget,
                          maxRevisions: typeof value === 'number' ? value : undefined,
                        },
                      });
                    }}
                  />
                  <span className={cn('text-sm', styles.fieldHint)} style={{ fontSize: 12 }}>
                    {t('orchestration.maxPlanningRevisionsHint')}
                  </span>
                </div>
              </div>
            </div>

            <div className={cn('flex flex-col', styles.section)} style={{ gap: 12 }}>
              <div className={styles.inline}>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span className="text-sm" style={{ fontWeight: 600 }}>
                    {t('orchestration.autoDispatchLabel')}
                  </span>
                  <span className={cn('text-sm', styles.fieldHint)} style={{ fontSize: 12 }}>
                    {t('orchestration.autoDispatchHint')}
                  </span>
                </div>
                <Switch
                  checked={draft.orchestrationPolicy.autoDispatch}
                  disabled={saving}
                  onCheckedChange={(checked) => patchPolicy({ autoDispatch: checked })}
                />
              </div>
              <span className={cn('text-sm', styles.fieldHint)} style={{ fontSize: 12 }}>
                {t('orchestration.autoDispatchBoundary')}
              </span>
            </div>

            <div className={cn('flex flex-col', styles.section)} style={{ gap: 12 }}>
              <span className="text-sm" style={{ fontWeight: 600 }}>
                {t('orchestration.executionTitle')}
              </span>
              <div className={cn('flex flex-col', styles.grid)} style={{ gap: 12 }}>
                <div className={styles.field}>
                  <span className={cn('text-sm', styles.fieldLabel)}>
                    {t('orchestration.concurrencyLabel')}
                  </span>
                  <Input
                    disabled={saving}
                    min={1}
                    placeholder={t('orchestration.unlimited')}
                    step="any"
                    style={{ width: '100%' }}
                    type="number"
                    value={draft.orchestrationPolicy.concurrencyLimit ?? ''}
                    onChange={(event) => {
                      const value =
                        event.target.value === '' || !Number.isFinite(event.target.valueAsNumber)
                          ? null
                          : event.target.valueAsNumber;
                      patchPolicy({
                        concurrencyLimit: typeof value === 'number' ? value : undefined,
                      });
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <span className={cn('text-sm', styles.fieldLabel)}>
                    {t('orchestration.maxRunsLabel')}
                  </span>
                  <Input
                    disabled={saving}
                    min={1}
                    placeholder={t('orchestration.unlimited')}
                    step="any"
                    style={{ width: '100%' }}
                    type="number"
                    value={draft.orchestrationPolicy.executionBudget?.maxRuns ?? ''}
                    onChange={(event) => {
                      const value =
                        event.target.value === '' || !Number.isFinite(event.target.valueAsNumber)
                          ? null
                          : event.target.valueAsNumber;
                      patchPolicy({
                        executionBudget: {
                          ...draft.orchestrationPolicy.executionBudget,
                          maxRuns: typeof value === 'number' ? value : undefined,
                        },
                      });
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <span className={cn('text-sm', styles.fieldLabel)}>
                    {t('orchestration.maxCostLabel')}
                  </span>
                  <Input
                    disabled={saving}
                    min={0}
                    placeholder={t('orchestration.unlimited')}
                    step="any"
                    style={{ width: '100%' }}
                    type="number"
                    value={draft.orchestrationPolicy.executionBudget?.maxCost ?? ''}
                    onChange={(event) => {
                      const value =
                        event.target.value === '' || !Number.isFinite(event.target.valueAsNumber)
                          ? null
                          : event.target.valueAsNumber;
                      patchPolicy({
                        executionBudget: {
                          ...draft.orchestrationPolicy.executionBudget,
                          maxCost: typeof value === 'number' ? value : undefined,
                        },
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={cn('flex flex-col', styles.section)} style={{ gap: 12 }}>
              <div className={styles.inline}>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span className="text-sm" style={{ fontWeight: 600 }}>
                    {t('orchestration.humanReviewLabel')}
                  </span>
                  <span className={cn('text-sm', styles.fieldHint)} style={{ fontSize: 12 }}>
                    {humanReviewRequired
                      ? t('orchestration.humanReviewRequiredHint')
                      : t('orchestration.humanReviewHint')}
                  </span>
                </div>
                <Switch
                  checked={draft.orchestrationPolicy.requireHumanReview || humanReviewRequired}
                  disabled={saving || humanReviewRequired}
                  onCheckedChange={(checked) => patchPolicy({ requireHumanReview: checked })}
                />
              </div>
              <div className={styles.status}>
                <Badge variant="secondary">
                  <ShieldCheckIcon size={13} />
                  {humanReviewRequired || draft.orchestrationPolicy.requireHumanReview
                    ? t('orchestration.humanReviewRequiredTag')
                    : t('orchestration.humanReviewOptionalTag')}
                </Badge>
                <span className={cn('text-sm', styles.fieldHint)} style={{ fontSize: 12 }}>
                  {t('orchestration.revision', { revision: view.orchestrationPolicyRevision })}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
});

OrchestrationPolicyCard.displayName = 'OrchestrationPolicyCard';

export default OrchestrationPolicyCard;
