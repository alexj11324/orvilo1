'use client';

import { Tooltip } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import AsyncError from '@/components/AsyncError';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import Form, { type FormGroupItemType, type FormItemProps } from '@/components/GroupForm';
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/reui/number-field';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { FieldError } from '@/components/ui/field';
import { FORM_STYLE } from '@/const/layoutTokens';
import ModelSelect from '@/features/ModelSelect';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { usePermission } from '@/hooks/usePermission';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';
import type { SystemAgentItem, UserServiceModelConfigKey } from '@/types/user/settings';

// Only the rows this form renders. Listed positively so the locale keys
// templated from them (`systemAgent.${key}.title`) all exist.
type ModelAssignmentItemKey = Extract<
  UserServiceModelConfigKey,
  | 'expertise'
  | 'goal'
  | 'memoryAnalysisAgentConfig'
  | 'userMemoryEmbedding'
  | 'userMemoryPersonaWriter'
>;

interface SystemAgentModelItem {
  contextLimit?: boolean;
  key: ModelAssignmentItemKey;
  modelType?: 'chat' | 'embedding';
}

type LoadingKey = 'defaultAgent' | UserServiceModelConfigKey;

type SavingGroup = 'assignments' | 'memory';

type ModelChoice = Pick<SystemAgentItem, 'model' | 'provider'>;
type AssignmentValue = Omit<SystemAgentItem, 'contextLimit'> & { contextLimit: number | null };
interface ModelAssignmentsValues {
  defaultAgent: { config: ModelChoice };
  systemAgent: Record<ModelAssignmentItemKey, AssignmentValue>;
}
const contextLimitSchema = z.number().min(1).nullable();
const assignmentValue = (value: SystemAgentItem): AssignmentValue => ({
  ...value,
  contextLimit: value.contextLimit ?? null,
});

const SYSTEM_AGENT_MODEL_ITEMS: SystemAgentModelItem[] = [{ key: 'expertise' }, { key: 'goal' }];

const MEMORY_MODEL_ITEMS: SystemAgentModelItem[] = [
  { contextLimit: true, key: 'memoryAnalysisAgentConfig' },
  { contextLimit: true, key: 'userMemoryPersonaWriter' },
  { contextLimit: true, key: 'userMemoryEmbedding', modelType: 'embedding' },
];

const ModelAssignmentsForm = memo(() => {
  const { t } = useTranslation('setting');
  const { allowed: canManageServiceModel, reason } = usePermission('manage_settings');
  const [defaultAgent, systemAgentSettings] = useUserStore(
    (s) => [settingsSelectors.defaultAgent(s), settingsSelectors.currentSystemAgent(s)],
    isEqual,
  );
  const [
    updateDefaultAgent,
    updateSystemAgent,
    isUserStateInit,
    isUserStateInitError,
    refreshUserState,
  ] = useUserStore((s) => [
    s.updateDefaultAgent,
    s.updateSystemAgent,
    s.isUserStateInit,
    s.isUserStateInitError,
    s.refreshUserState,
  ]);
  const [loadingKey, setLoadingKey] = useState<LoadingKey>();
  // Track which group last saved so its AutoSaveHint (and only its) reflects the
  // shared save-state — the write-side counterpart to the read-side AsyncError above.
  const [savingGroup, setSavingGroup] = useState<SavingGroup>();
  const {
    status: saveStatus,
    lastSavedAt,
    save,
    retry,
  } = useSaveState({ latestRequestOnly: true });
  const permission = useRef(canManageServiceModel);
  useEffect(() => {
    permission.current = canManageServiceModel;
  }, [canManageServiceModel]);
  const values = useMemo<ModelAssignmentsValues>(
    () => ({
      defaultAgent: { config: defaultAgent.config },
      systemAgent: {
        expertise: assignmentValue(systemAgentSettings.expertise),
        goal: assignmentValue(systemAgentSettings.goal),
        memoryAnalysisAgentConfig: assignmentValue(systemAgentSettings.memoryAnalysisAgentConfig),
        userMemoryEmbedding: assignmentValue(systemAgentSettings.userMemoryEmbedding),
        userMemoryPersonaWriter: assignmentValue(systemAgentSettings.userMemoryPersonaWriter),
      },
    }),
    [defaultAgent.config, systemAgentSettings],
  );
  const { control, getValues, trigger } = useForm<ModelAssignmentsValues>({
    values,
    mode: 'onChange',
    shouldUnregister: false,
  });

  useEffect(() => {
    if (loadingKey === 'defaultAgent') setLoadingKey(undefined);
  }, [defaultAgent.config.model, defaultAgent.config.provider, loadingKey]);

  const groupOfKey = (key: UserServiceModelConfigKey): SavingGroup => {
    if (MEMORY_MODEL_ITEMS.some((item) => item.key === key)) return 'memory';
    return 'assignments';
  };

  if (!isUserStateInit) {
    // A failed user-state init must show error + Retry, not a permanent skeleton
    if (isUserStateInitError)
      return (
        <AsyncError
          error={isUserStateInitError}
          variant={'block'}
          onRetry={() => refreshUserState()}
        />
      );
    return <RouteLoading />;
  }

  const updateDefaultAgentModel = async ({
    model,
    provider,
  }: {
    model: string;
    provider: string;
  }) => {
    if (!permission.current) return;

    setSavingGroup('assignments');
    setLoadingKey('defaultAgent');
    try {
      await save(() => updateDefaultAgent({ config: { model, provider } }));
    } finally {
      setLoadingKey(undefined);
    }
  };

  const updateSystemAgentModel = async (
    key: UserServiceModelConfigKey,
    value: Partial<SystemAgentItem>,
  ) => {
    if (!permission.current) return;

    setSavingGroup(groupOfKey(key));
    setLoadingKey(key);
    try {
      await save(() => updateSystemAgent(key, value));
    } finally {
      setLoadingKey(undefined);
    }
  };

  const defaultAgentItem: FormItemProps = {
    children: (
      <Tooltip title={reason}>
        <div className="flex w-[min(100%,448px)] flex-row items-center gap-3">
          <Controller
            control={control}
            name="defaultAgent.config"
            render={({ field }) => (
              <ModelSelect
                disabled={!canManageServiceModel}
                showAbility={false}
                style={{ minWidth: 0, width: '100%' }}
                value={field.value}
                onChange={(next) => {
                  if (!permission.current) return;
                  field.onChange({ ...getValues(field.name), ...next });
                  void updateDefaultAgentModel(next);
                }}
              />
            )}
          />
        </div>
      </Tooltip>
    ),
    // Only this row carries a `desc`: "Default" is a model value an Agent can
    // pick, and the row is the only place that says what it resolves to. The
    // rows below stay description-free — label plus picker already say it.
    desc: t('defaultAgent.desc'),
    label: <span className="flex min-h-9 items-center">{t('defaultAgent.title')}</span>,
  };

  const systemModelItems: FormItemProps[] = SYSTEM_AGENT_MODEL_ITEMS.map(({ key }) => {
    return {
      children: (
        <Tooltip title={reason}>
          <div className="flex w-[min(100%,448px)] flex-row items-center gap-3">
            <Controller
              control={control}
              name={`systemAgent.${key}`}
              render={({ field }) => (
                <ModelSelect
                  disabled={!canManageServiceModel}
                  showAbility={false}
                  style={{ minWidth: 0, width: '100%' }}
                  value={field.value}
                  onChange={(next) => {
                    if (!permission.current) return;
                    field.onChange({ ...getValues(field.name), ...next });
                    void updateSystemAgentModel(key, next);
                  }}
                />
              )}
            />
          </div>
        </Tooltip>
      ),
      // Only the planning row says more than its label: it also drives acceptance.
      desc: key === 'goal' ? t('systemAgent.goal.modelDesc') : undefined,
      label: <span className="flex min-h-9 items-center">{t(`systemAgent.${key}.title`)}</span>,
    } satisfies FormItemProps;
  });

  const memoryModelItems: FormItemProps[] = MEMORY_MODEL_ITEMS.map(
    ({ contextLimit, key, modelType }) => {
      return {
        children: (
          <div className="flex w-[min(100%,448px)] flex-row items-center gap-3">
            <Controller
              control={control}
              name={`systemAgent.${key}`}
              render={({ field }) => (
                <ModelSelect
                  disabled={!canManageServiceModel}
                  modelType={modelType}
                  showAbility={false}
                  style={{ minWidth: 0, width: '100%' }}
                  value={field.value}
                  onChange={(next) => {
                    if (!permission.current) return;
                    field.onChange({ ...getValues(field.name), ...next });
                    void updateSystemAgentModel(key, next);
                  }}
                />
              )}
            />
            {contextLimit && (
              <Controller
                control={control}
                name={`systemAgent.${key}.contextLimit`}
                render={({ field, fieldState }) => (
                  <NumberField
                    className="w-35 flex-none"
                    disabled={!canManageServiceModel}
                    min={1}
                    name={field.name}
                    size="normal"
                    value={field.value}
                    onValueChange={(next) => {
                      if (!permission.current) return;
                      field.onChange(next);
                      if (contextLimitSchema.safeParse(next).success)
                        void updateSystemAgentModel(key, {
                          contextLimit: typeof next === 'number' ? next : undefined,
                        });
                    }}
                  >
                    <NumberFieldGroup>
                      <NumberFieldDecrement
                        aria-label={`${t('serviceModel.contextLimit.placeholder')} −1`}
                      />
                      <NumberFieldInput
                        aria-invalid={!!fieldState.error || undefined}
                        aria-label={t('serviceModel.contextLimit.placeholder')}
                        placeholder={t('serviceModel.contextLimit.placeholder')}
                        ref={field.ref}
                        onBlur={field.onBlur}
                      />
                      <NumberFieldIncrement
                        aria-label={`${t('serviceModel.contextLimit.placeholder')} +1`}
                      />
                    </NumberFieldGroup>
                    <FieldError errors={[fieldState.error]} />
                  </NumberField>
                )}
                rules={{
                  validate: (next) =>
                    contextLimitSchema.safeParse(next).success ||
                    t('serviceModel.contextLimit.placeholder'),
                }}
              />
            )}
          </div>
        ),
        desc: t(`systemAgent.${key}.modelDesc`),
        label: <span className="flex min-h-9 items-center">{t(`systemAgent.${key}.title`)}</span>,
      } satisfies FormItemProps;
    },
  );

  const renderSaveHint = (group: SavingGroup) =>
    savingGroup === group && (
      <AutoSaveHint
        lastUpdatedTime={lastSavedAt}
        saveStatus={saveStatus}
        onRetry={
          canManageServiceModel
            ? () => {
                if (permission.current) void retry();
              }
            : undefined
        }
      />
    );

  const modelAssignments: FormGroupItemType = {
    children: [defaultAgentItem, ...systemModelItems],
    extra: renderSaveHint('assignments'),
    title: (
      <SettingsSearchAnchor id={'service-model-assignments'}>
        {t('serviceModel.modelAssignments.title')}
      </SettingsSearchAnchor>
    ),
  };

  const memoryModels: FormGroupItemType = {
    children: memoryModelItems,
    extra: renderSaveHint('memory'),
    title: (
      <SettingsSearchAnchor id={'service-model-memory'}>
        {t('serviceModel.memoryModels.title')}
      </SettingsSearchAnchor>
    ),
  };

  return (
    <Form
      collapsible={false}
      items={[modelAssignments, memoryModels]}
      itemsType={'group'}
      variant={'filled'}
      {...FORM_STYLE}
      itemMinWidth={undefined}
      onSubmit={(event) => {
        event.preventDefault();
        // This is the existing autosave surface: Enter never submits a settings payload.
        void trigger();
      }}
    />
  );
});

ModelAssignmentsForm.displayName = 'ModelAssignmentsForm';

export default ModelAssignmentsForm;
