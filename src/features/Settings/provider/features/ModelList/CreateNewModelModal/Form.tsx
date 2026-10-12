'use client';

import type { AiModelType, AiProviderModelListItem, CreateAiModelParams } from 'model-bank';
import { type ReactNode, useEffect, useId, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import MaxTokenSlider from '@/components/MaxTokenSlider';
import Select from '@/components/Select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/useIsMobile';

import ExtendParamsSelect from './ExtendParamsSelect';
import { hasDuplicateModelId } from './utils';

export type ModelFormValues = Pick<
  CreateAiModelParams,
  'abilities' | 'contextWindowTokens' | 'displayName' | 'id' | 'settings' | 'type'
> &
  Pick<AiProviderModelListItem, 'config'>;

/** Only the fields mounted by this form belong in the model mutation. */
export const activeModelFormValues = (
  values: Partial<AiProviderModelListItem>,
  showDeployName?: boolean,
): ModelFormValues => ({
  abilities: {
    functionCall: values.abilities?.functionCall,
    imageOutput: values.abilities?.imageOutput,
    reasoning: values.abilities?.reasoning,
    search: values.abilities?.search,
    video: values.abilities?.video,
    vision: values.abilities?.vision,
  },
  ...(showDeployName ? { config: { deploymentName: values.config?.deploymentName } } : {}),
  contextWindowTokens: values.contextWindowTokens,
  displayName: values.displayName,
  id: values.id ?? '',
  settings: { extendParams: values.settings?.extendParams },
  type: values.type,
});

export interface ModelConfigFormHandle {
  getFieldsValue: () => ModelFormValues;
  validateFields: () => Promise<ModelFormValues | undefined>;
}

interface ModelConfigFormProps {
  disabled?: boolean;
  existingModelIds?: string[];
  idEditable?: boolean;
  initialValues?: AiProviderModelListItem;
  onFormInstanceReady: (instance: ModelConfigFormHandle | undefined) => void;
  showDeployName?: boolean;
  type?: AiModelType;
}

const ModelConfigForm = ({
  showDeployName,
  idEditable = true,
  onFormInstanceReady,
  initialValues,
  disabled,
  existingModelIds = [],
}: ModelConfigFormProps) => {
  const { t } = useTranslation('modelProvider');
  const id = useId();
  const isMobile = useIsMobile();
  const initialized = useRef(!!initialValues);
  const {
    control,
    getValues,
    reset,
    trigger,
    formState: { errors },
  } = useForm<ModelFormValues>({
    defaultValues: activeModelFormValues(initialValues ?? {}, showDeployName),
    mode: 'onChange',
    shouldUnregister: false,
  });

  // Seed a model that arrives after mount once; revalidation must not erase a draft.
  useEffect(() => {
    if (!initialValues || initialized.current) return;
    reset(activeModelFormValues(initialValues, showDeployName));
    initialized.current = true;
  }, [initialValues, reset, showDeployName]);

  useEffect(() => {
    onFormInstanceReady({
      getFieldsValue: () => activeModelFormValues(getValues(), showDeployName),
      validateFields: async () => {
        if (!(await trigger('id', { shouldFocus: true }))) return undefined;
        // Validate without transforming the raw ID or optional payload values.
        return activeModelFormValues(getValues(), showDeployName);
      },
    });
    return () => onFormInstanceReady(undefined);
  }, [getValues, onFormInstanceReady, showDeployName, trigger]);

  const modelTypeOptions = useMemo(
    () =>
      (
        [
          'chat',
          'embedding',
          'tts',
          'asr',
          'image',
          'video',
          'text2music',
          'realtime',
        ] as AiModelType[]
      ).map((value) => {
        const label = t(`providerModels.item.modelConfig.type.options.${value}`);
        return { label: label !== value ? `${label} (${value})` : label, value };
      }),
    [t],
  );

  const fieldId = (name: string) => `${id}-${name}`;
  const descriptionId = (name: string) => `${fieldId(name)}-description`;
  const configKey = 'providerModels.item.modelConfig' as const;
  const row = (name: string, label: ReactNode, child: ReactNode, description?: ReactNode) => (
    <Field
      data-disabled={disabled || undefined}
      data-invalid={name === 'id' && !!errors.id}
      orientation={isMobile ? 'vertical' : 'horizontal'}
    >
      <FieldLabel
        className={isMobile ? 'text-sm leading-5.5' : 'w-1/5 shrink-0 text-sm leading-5.5'}
        htmlFor={name === 'tokens' ? undefined : fieldId(name)}
        id={`${fieldId(name)}-label`}
      >
        {label}
      </FieldLabel>
      <FieldContent className="min-w-0 gap-2">
        {child}
        {description && (
          <FieldDescription className="text-sm leading-5.5" id={descriptionId(name)}>
            {description}
          </FieldDescription>
        )}
      </FieldContent>
    </Field>
  );
  const abilityField = (
    name: 'functionCall' | 'vision' | 'reasoning' | 'search' | 'imageOutput' | 'video',
  ) =>
    row(
      name,
      t(`${configKey}.${name}.title`),
      <Controller
        control={control}
        name={`abilities.${name}`}
        render={({ field }) => (
          <Checkbox
            aria-describedby={descriptionId(name)}
            checked={field.value ?? false}
            disabled={disabled}
            id={fieldId(name)}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            onCheckedChange={field.onChange}
          />
        )}
      />,
      t(`${configKey}.${name}.extra`),
    );

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <form
        noValidate
        className="mt-4 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          // Enter validated the previous Form without calling the footer mutation.
          void trigger('id', { shouldFocus: true });
        }}
      >
        <FieldGroup className="gap-4">
          {row(
            'id',
            t(`${configKey}.id.title`),
            <>
              <Controller
                control={control}
                name="id"
                render={({ field }) => (
                  <Input
                    {...field}
                    aria-required
                    aria-invalid={!!errors.id || undefined}
                    disabled={disabled || !idEditable}
                    id={fieldId('id')}
                    placeholder={t(`${configKey}.id.placeholder`)}
                    value={field.value ?? ''}
                    visualSize="normal"
                    aria-describedby={[descriptionId('id'), errors.id && `${fieldId('id')}-error`]
                      .filter(Boolean)
                      .join(' ')}
                  />
                )}
                rules={{
                  validate: (value) => {
                    const result = z
                      .string()
                      .min(1, t(`${configKey}.id.placeholder`))
                      .refine((current) => !hasDuplicateModelId(current, existingModelIds), {
                        message: t(`${configKey}.id.duplicate`),
                      })
                      .safeParse(value);
                    return result.success || result.error.issues[0].message;
                  },
                }}
              />
              <FieldError errors={[errors.id]} id={`${fieldId('id')}-error`} />
            </>,
            t(`${configKey}.id.extra`),
          )}
          {showDeployName &&
            row(
              'deployName',
              t(`${configKey}.deployName.title`),
              <Controller
                control={control}
                name="config.deploymentName"
                render={({ field }) => (
                  <Input
                    {...field}
                    aria-describedby={descriptionId('deployName')}
                    disabled={disabled}
                    id={fieldId('deployName')}
                    placeholder={t(`${configKey}.deployName.placeholder`)}
                    value={field.value ?? ''}
                    visualSize="normal"
                  />
                )}
              />,
              t(`${configKey}.deployName.extra`),
            )}
          {row(
            'displayName',
            t(`${configKey}.displayName.title`),
            <Controller
              control={control}
              name="displayName"
              render={({ field }) => (
                <Input
                  {...field}
                  disabled={disabled}
                  id={fieldId('displayName')}
                  placeholder={t(`${configKey}.displayName.placeholder`)}
                  value={field.value ?? ''}
                  visualSize="normal"
                />
              )}
            />,
          )}
          {row(
            'tokens',
            t(`${configKey}.tokens.title`),
            <Controller
              control={control}
              name="contextWindowTokens"
              render={({ field }) => (
                <fieldset
                  aria-describedby={descriptionId('tokens')}
                  aria-labelledby={`${fieldId('tokens')}-label`}
                  disabled={disabled}
                  id={fieldId('tokens')}
                  inert={disabled || undefined}
                >
                  <MaxTokenSlider value={field.value} onChange={field.onChange} />
                </fieldset>
              )}
            />,
            t(`${configKey}.tokens.extra`),
          )}
          {row(
            'extendParams',
            t(`${configKey}.extendParams.title`),
            <Controller
              control={control}
              name="settings.extendParams"
              render={({ field }) => (
                <ExtendParamsSelect
                  aria-label={t(`${configKey}.extendParams.title`)}
                  disabled={disabled}
                  id={fieldId('extendParams')}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />,
            t(`${configKey}.extendParams.extra`),
          )}
          {abilityField('functionCall')}
          {abilityField('vision')}
          {abilityField('reasoning')}
          {abilityField('search')}
          {abilityField('imageOutput')}
          {abilityField('video')}
          {row(
            'type',
            t(`${configKey}.type.title`),
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select<AiModelType>
                  aria-label={t(`${configKey}.type.title`)}
                  disabled={disabled}
                  id={fieldId('type')}
                  options={modelTypeOptions}
                  placeholder={t(`${configKey}.type.placeholder`)}
                  size="normal"
                  value={field.value ?? null}
                  onChange={(next) => {
                    if (!Array.isArray(next)) field.onChange(next ?? undefined);
                  }}
                />
              )}
            />,
            t(`${configKey}.type.extra`),
          )}
        </FieldGroup>
      </form>
    </div>
  );
};

export default ModelConfigForm;
