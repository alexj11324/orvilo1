import isEqual from 'fast-deep-equal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { usePermission } from '@/hooks/usePermission';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';
import type { SystemAgentItem, UserServiceModelConfigKey } from '@/types/user/settings';

// Only the rows this form renders. Listed positively so the locale keys
// templated from them (`systemAgent.${key}.title`) all exist.
export type ModelAssignmentItemKey = Extract<
  UserServiceModelConfigKey,
  | 'expertise'
  | 'orchestrationWorkflow'
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

export type SavingGroup = 'assignments' | 'memory';

type FieldChange = (value: unknown) => void;
type ModelSelection = { model: string; provider: string };
type ModelChoice = Pick<SystemAgentItem, 'model'> & Partial<Pick<SystemAgentItem, 'provider'>>;
type AssignmentValue = Omit<SystemAgentItem, 'contextLimit'> & { contextLimit: number | null };
export interface ModelAssignmentsValues {
  defaultAgent: { config: ModelChoice };
  systemAgent: Record<ModelAssignmentItemKey, AssignmentValue>;
}
const contextLimitSchema = z.number().min(1).nullable();
const assignmentValue = (value: SystemAgentItem): AssignmentValue => ({
  ...value,
  contextLimit: value.contextLimit ?? null,
});

export const SYSTEM_AGENT_MODEL_ITEMS: SystemAgentModelItem[] = [
  { key: 'expertise' },
  { key: 'orchestrationWorkflow' },
];

export const MEMORY_MODEL_ITEMS: SystemAgentModelItem[] = [
  { contextLimit: true, key: 'memoryAnalysisAgentConfig' },
  { contextLimit: true, key: 'userMemoryPersonaWriter' },
  { contextLimit: true, key: 'userMemoryEmbedding', modelType: 'embedding' },
];

/** Owns RHF values, permission-safe field changes and the shared autosave lifecycle. */
export const useModelAssignmentsForm = () => {
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
  // shared save-state — the write-side counterpart to the view's read-side AsyncError.
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
        orchestrationWorkflow: assignmentValue(systemAgentSettings.orchestrationWorkflow),
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

  const changeDefaultAgentModel = async (next: ModelSelection, onChange: FieldChange) => {
    if (!permission.current) return;
    onChange({ ...getValues('defaultAgent.config'), ...next });
    const { model, provider } = next;

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

  const changeSystemAgentModel = async (
    key: ModelAssignmentItemKey,
    next: ModelSelection,
    onChange: FieldChange,
  ) => {
    if (!permission.current) return;
    onChange({ ...getValues(`systemAgent.${key}`), ...next });
    await updateSystemAgentModel(key, next);
  };

  const changeContextLimit = async (
    key: ModelAssignmentItemKey,
    next: number | null,
    onChange: FieldChange,
  ) => {
    if (!permission.current) return;
    onChange(next);
    if (contextLimitSchema.safeParse(next).success)
      await updateSystemAgentModel(key, {
        contextLimit: typeof next === 'number' ? next : undefined,
      });
  };

  const retrySave = async () => {
    if (permission.current) await retry();
  };

  const contextLimitRules = {
    validate: (next: number | null) =>
      contextLimitSchema.safeParse(next).success || t('serviceModel.contextLimit.placeholder'),
  };

  return {
    canManageServiceModel,
    changeContextLimit,
    changeDefaultAgentModel,
    changeSystemAgentModel,
    contextLimitRules,
    control,
    isUserStateInit,
    isUserStateInitError,
    lastSavedAt,
    reason,
    refreshUserState,
    retrySave,
    saveStatus,
    savingGroup,
    trigger,
  };
};
