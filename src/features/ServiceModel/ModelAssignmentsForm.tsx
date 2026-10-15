'use client';

import { memo } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FORM_STYLE } from '@/const/layoutTokens';
import ModelSelect from '@/features/ModelSelect';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { useIsMobile } from '@/hooks/useIsMobile';

import {
  MEMORY_MODEL_ITEMS,
  type SavingGroup,
  SYSTEM_AGENT_MODEL_ITEMS,
  useModelAssignmentsForm,
} from './useModelAssignmentsForm';

const ModelAssignmentsForm = memo(() => {
  const { t } = useTranslation('setting');
  const isMobile = useIsMobile();
  const {
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
  } = useModelAssignmentsForm();

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

  const defaultAgentItem: FormItemProps = {
    children: (
      <Tooltip>
        <TooltipTrigger
          render={<div className="flex w-full max-w-112 flex-row items-center gap-3" />}
        >
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
                  void changeDefaultAgentModel(next, field.onChange);
                }}
              />
            )}
          />
        </TooltipTrigger>
        {reason && <TooltipContent>{reason}</TooltipContent>}
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
        <Tooltip>
          <TooltipTrigger
            render={<div className="flex w-full max-w-112 flex-row items-center gap-3" />}
          >
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
                    void changeSystemAgentModel(key, next, field.onChange);
                  }}
                />
              )}
            />
          </TooltipTrigger>
          {reason && <TooltipContent>{reason}</TooltipContent>}
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
          <div className="flex w-full max-w-112 flex-row items-center gap-3">
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
                    void changeSystemAgentModel(key, next, field.onChange);
                  }}
                />
              )}
            />
            {contextLimit && (
              <Controller
                control={control}
                name={`systemAgent.${key}.contextLimit`}
                rules={contextLimitRules}
                render={({ field, fieldState }) => (
                  <NumberField
                    className="w-35 flex-none"
                    disabled={!canManageServiceModel}
                    min={1}
                    name={field.name}
                    size="normal"
                    value={field.value}
                    onValueChange={(next) => {
                      void changeContextLimit(key, next, field.onChange);
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
        onRetry={canManageServiceModel ? () => void retrySave() : undefined}
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
      layout={isMobile ? 'vertical' : 'horizontal'}
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
