'use client';

import { Block, Flexbox, InputNumber } from '@lobehub/ui';
import { Alert, Button, Select, Switch, Tag, Text, toast } from '@lobehub/ui/base-ui';
import type { ProjectOrchestrationPolicy } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { CircleAlertIcon, RefreshCwIcon, SaveIcon, ShieldCheckIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ArticleSkeleton } from '@/components/Skeleton';
import { usePermission } from '@/hooks/usePermission';
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
  coordinatorAgentId: string;
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
  const { allowed: canManagePolicy } = usePermission('manage_settings');
  const policySWR = useProjectStore((state) => state.useFetchProjectOrchestrationPolicy)(
    projectId,
    canManagePolicy,
  );
  const savePolicy = useProjectStore((state) => state.updateProjectOrchestrationPolicy);
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

  return (
    <Block className={styles.card} variant={'outlined'}>
      <Flexbox gap={16} padding={20}>
        <div className={styles.cardHeader}>
          <Flexbox gap={4}>
            <Text as={'h2'} fontSize={16} style={{ margin: 0 }} weight={600}>
              {t('orchestration.title')}
            </Text>
            <Text className={styles.description} fontSize={13}>
              {t('orchestration.description')}
            </Text>
          </Flexbox>
          <Button
            disabled={!isDirty || saving || stale || !draft}
            icon={SaveIcon}
            loading={saving}
            type={'primary'}
            onClick={() => void handleSave()}
          >
            {t('orchestration.save')}
          </Button>
        </div>

        {policySWR.error && (
          <Alert
            action={<Button onClick={() => void reload()}>{t('orchestration.retry')}</Button>}
            description={errorMessage(policySWR.error, t('orchestration.loadError'))}
            icon={<CircleAlertIcon size={16} />}
            title={t('orchestration.loadError')}
            type={'error'}
          />
        )}

        {stale && (
          <Alert
            action={<Button onClick={() => void reload()}>{t('orchestration.reload')}</Button>}
            description={t('orchestration.staleDescription')}
            title={t('orchestration.staleTitle')}
            type={'warning'}
          />
        )}

        {saveError && (
          <Alert
            description={saveError}
            title={t('orchestration.saveError')}
            type={'error'}
            action={
              <Button onClick={() => void handleSave()}>{t('orchestration.retrySave')}</Button>
            }
          />
        )}

        {!policySWR.error && (!draft || !view) ? (
          <ArticleSkeleton rows={5} />
        ) : draft && view ? (
          <>
            <Flexbox horizontal align={'center'} className={styles.note} gap={10}>
              <Tag icon={<RefreshCwIcon size={13} />}>{t('orchestration.syncLabel')}</Tag>
              <Text className={styles.description} fontSize={12}>
                {t('orchestration.syncDescription')}
              </Text>
            </Flexbox>

            <Flexbox className={styles.section} gap={12}>
              <Flexbox className={styles.grid} gap={12}>
                <div className={styles.field}>
                  <Text className={styles.fieldLabel}>{t('orchestration.coordinatorLabel')}</Text>
                  <Select
                    disabled={saving}
                    options={participantOptions}
                    placeholder={t('orchestration.coordinatorPlaceholder')}
                    value={draft.coordinatorAgentId || undefined}
                    onChange={(value) => {
                      setDraft((current) =>
                        current ? { ...current, coordinatorAgentId: value } : current,
                      );
                      setStale(false);
                      setSaveError(null);
                    }}
                  />
                  <Text className={styles.fieldHint} fontSize={12}>
                    {t('orchestration.coordinatorHint')}
                  </Text>
                </div>

                <div className={styles.field}>
                  <Text className={styles.fieldLabel}>{t('orchestration.allowedAgentsLabel')}</Text>
                  <Select
                    allowClear
                    disabled={saving}
                    mode={'multiple'}
                    options={participantOptions}
                    placeholder={t('orchestration.allowedAgentsPlaceholder')}
                    value={draft.orchestrationPolicy.allowedAgentIds ?? []}
                    onChange={(value) => patchPolicy({ allowedAgentIds: value as string[] })}
                  />
                  <Text className={styles.fieldHint} fontSize={12}>
                    {t('orchestration.allowedAgentsHint')}
                  </Text>
                </div>

                <div className={styles.field}>
                  <Text className={styles.fieldLabel}>{t('orchestration.allowedRolesLabel')}</Text>
                  <Select
                    allowClear
                    disabled={saving}
                    mode={'multiple'}
                    options={roleOptions}
                    placeholder={t('orchestration.allowedRolesPlaceholder')}
                    value={draft.orchestrationPolicy.allowedRoles ?? []}
                    onChange={(value) => patchPolicy({ allowedRoles: value as string[] })}
                  />
                  <Text className={styles.fieldHint} fontSize={12}>
                    {t('orchestration.allowedRolesHint')}
                  </Text>
                </div>

                <div className={styles.field}>
                  <Text className={styles.fieldLabel}>{t('orchestration.replanModeLabel')}</Text>
                  <Select
                    disabled={saving}
                    value={draft.orchestrationPolicy.replanMode}
                    options={[
                      { label: t('orchestration.replanMode.disabled'), value: 'disabled' },
                      { label: t('orchestration.replanMode.observe'), value: 'observe' },
                      { label: t('orchestration.replanMode.suggest'), value: 'suggest' },
                      { label: t('orchestration.replanMode.apply'), value: 'apply' },
                    ]}
                    onChange={(value) =>
                      patchPolicy({
                        replanMode: value as ProjectOrchestrationPolicy['replanMode'],
                      })
                    }
                  />
                </div>
              </Flexbox>
            </Flexbox>

            <Flexbox className={styles.section} gap={12}>
              <div className={styles.inline}>
                <Flexbox gap={2}>
                  <Text weight={600}>{t('orchestration.autoDispatchLabel')}</Text>
                  <Text className={styles.fieldHint} fontSize={12}>
                    {t('orchestration.autoDispatchHint')}
                  </Text>
                </Flexbox>
                <Switch
                  checked={draft.orchestrationPolicy.autoDispatch}
                  disabled={saving}
                  onChange={(checked) => patchPolicy({ autoDispatch: checked })}
                />
              </div>
              <Text className={styles.fieldHint} fontSize={12}>
                {t('orchestration.autoDispatchBoundary')}
              </Text>
            </Flexbox>

            <Flexbox className={styles.section} gap={12}>
              <Text weight={600}>{t('orchestration.executionTitle')}</Text>
              <Flexbox className={styles.grid} gap={12}>
                <div className={styles.field}>
                  <Text className={styles.fieldLabel}>{t('orchestration.concurrencyLabel')}</Text>
                  <InputNumber
                    disabled={saving}
                    min={1}
                    placeholder={t('orchestration.unlimited')}
                    style={{ width: '100%' }}
                    value={draft.orchestrationPolicy.concurrencyLimit}
                    onChange={(value) =>
                      patchPolicy({
                        concurrencyLimit: typeof value === 'number' ? value : undefined,
                      })
                    }
                  />
                </div>
                <div className={styles.field}>
                  <Text className={styles.fieldLabel}>{t('orchestration.maxRunsLabel')}</Text>
                  <InputNumber
                    disabled={saving}
                    min={1}
                    placeholder={t('orchestration.unlimited')}
                    style={{ width: '100%' }}
                    value={draft.orchestrationPolicy.executionBudget?.maxRuns}
                    onChange={(value) =>
                      patchPolicy({
                        executionBudget: {
                          ...draft.orchestrationPolicy.executionBudget,
                          maxRuns: typeof value === 'number' ? value : undefined,
                        },
                      })
                    }
                  />
                </div>
                <div className={styles.field}>
                  <Text className={styles.fieldLabel}>{t('orchestration.maxCostLabel')}</Text>
                  <InputNumber
                    disabled={saving}
                    min={0}
                    placeholder={t('orchestration.unlimited')}
                    style={{ width: '100%' }}
                    value={draft.orchestrationPolicy.executionBudget?.maxCost}
                    onChange={(value) =>
                      patchPolicy({
                        executionBudget: {
                          ...draft.orchestrationPolicy.executionBudget,
                          maxCost: typeof value === 'number' ? value : undefined,
                        },
                      })
                    }
                  />
                </div>
              </Flexbox>
            </Flexbox>

            <Flexbox className={styles.section} gap={12}>
              <div className={styles.inline}>
                <Flexbox gap={2}>
                  <Text weight={600}>{t('orchestration.humanReviewLabel')}</Text>
                  <Text className={styles.fieldHint} fontSize={12}>
                    {humanReviewRequired
                      ? t('orchestration.humanReviewRequiredHint')
                      : t('orchestration.humanReviewHint')}
                  </Text>
                </Flexbox>
                <Switch
                  checked={draft.orchestrationPolicy.requireHumanReview || humanReviewRequired}
                  disabled={saving || humanReviewRequired}
                  onChange={(checked) => patchPolicy({ requireHumanReview: checked })}
                />
              </div>
              <div className={styles.status}>
                <Tag icon={<ShieldCheckIcon size={13} />}>
                  {humanReviewRequired
                    ? t('orchestration.humanReviewRequiredTag')
                    : t('orchestration.humanReviewOptionalTag')}
                </Tag>
                <Text className={styles.fieldHint} fontSize={12}>
                  {t('orchestration.revision', { revision: view.orchestrationPolicyRevision })}
                </Text>
              </div>
            </Flexbox>
          </>
        ) : null}
      </Flexbox>
    </Block>
  );
});

OrchestrationPolicyCard.displayName = 'OrchestrationPolicyCard';

export default OrchestrationPolicyCard;
