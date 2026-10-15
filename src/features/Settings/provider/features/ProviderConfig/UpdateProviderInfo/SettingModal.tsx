'use client';

import { t as i18nT } from 'i18next';
import { BrainIcon, X } from 'lucide-react';
import { memo, type ReactNode, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
  confirmModal,
  createModal,
  ModalFooter,
  type ModalInstance,
  useModalContext,
} from '@/components/Modal';
import { ProviderIcon } from '@/components/OrviloIcons';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useAiInfraStore } from '@/store/aiInfra/store';
import { type AiProviderDetailItem, type UpdateAiProviderParams } from '@/types/aiProvider';

import { CUSTOM_PROVIDER_SDK_OPTIONS } from '../../customProviderSdkOptions';
import { isResponsesApiSupportedSdkType, normalizeProviderSettings } from '../../providerSettings';

interface SettingContentProps {
  id: string;
  initialValues: AiProviderDetailItem;
}

// Match the old Form's mounted fields; never submit unrelated provider or vault values.
type ProviderInfoDraft = Pick<UpdateAiProviderParams, 'name' | 'description' | 'logo'> & {
  settings: Pick<NonNullable<UpdateAiProviderParams['settings']>, 'sdkType'>;
};

// Validation only: keep whitespace and submit the original field values.
const requiredText = z.string().min(1);

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="m-0 text-sm font-semibold text-muted-foreground">{children}</h3>
);

const SettingContent = memo<SettingContentProps>(({ initialValues, id }) => {
  const { t } = useTranslation(['modelProvider', 'common']);
  const formId = useId();
  const [loading, setLoading] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProviderInfoDraft>({
    defaultValues: {
      name: initialValues.name,
      description: initialValues.description,
      logo: initialValues.logo,
      settings: { sdkType: initialValues.settings.sdkType },
    },
    mode: 'onChange',
    shouldFocusError: false,
    shouldUnregister: false,
  });
  const [updateAiProvider, deleteAiProvider] = useAiInfraStore((s) => [
    s.updateAiProvider,
    s.deleteAiProvider,
  ]);

  const navigate = useWorkspaceAwareNavigate();
  const { close } = useModalContext();
  const fieldId = (name: string) => `${formId}-${name}`;
  const errorId = (name: string) => `${fieldId(name)}-error`;

  const onFinish = async (values: UpdateAiProviderParams) => {
    setLoading(true);

    try {
      const finalValues: UpdateAiProviderParams = {
        ...values,
        settings: normalizeProviderSettings({
          nextSettings: values.settings,
          previousSettings: initialValues.settings,
        }) as UpdateAiProviderParams['settings'],
      };

      const nextSdkType = finalValues.settings?.sdkType;
      if (nextSdkType && !isResponsesApiSupportedSdkType(nextSdkType)) {
        const previousConfig = (initialValues as { config?: UpdateAiProviderParams['config'] })
          .config;

        finalValues.config = {
          ...previousConfig,
          ...finalValues.config,
          enableResponseApi: false,
        };
      }

      await updateAiProvider(id, finalValues);
      setLoading(false);
      toast.success(t('updateAiProvider.updateSuccess'));
      close();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleDelete = () => {
    confirmModal({
      content: t('updateAiProvider.confirmDeleteDescription'),
      okButtonProps: { danger: true },
      okText: t('delete', { ns: 'common' }),
      onOk: async () => {
        await deleteAiProvider(id);
        navigate('/settings/provider/all');
        close();
        toast.success(t('updateAiProvider.deleteSuccess'));
      },
      title: t('updateAiProvider.confirmDelete'),
    });
  };

  return (
    <div className="flex flex-col">
      <form
        noValidate
        id={formId}
        onSubmit={handleSubmit(onFinish, (invalid) => {
          const name = invalid.name
            ? 'name'
            : invalid.settings?.sdkType
              ? 'settings.sdkType'
              : undefined;
          if (!name) return;
          const input = document.getElementById(fieldId(name));
          input?.scrollIntoView({ behavior: 'instant', block: 'end' });
          input?.focus({ preventScroll: true });
        })}
      >
        <FieldGroup className="gap-4">
          <SectionTitle>{t('createNewAiProvider.basicTitle')}</SectionTitle>

          <Field>
            <FieldTitle className="text-sm leading-5.5">
              {t('createNewAiProvider.id.title')}
            </FieldTitle>
            <span className="text-xs leading-5 text-muted-foreground">{initialValues.id}</span>
          </Field>

          <Field data-invalid={!!errors.name}>
            <FieldLabel className="text-sm leading-5.5" htmlFor={fieldId('name')}>
              <span aria-hidden className="text-destructive-text">
                *
              </span>
              {t('createNewAiProvider.name.title')}
            </FieldLabel>
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <Input
                  {...field}
                  aria-required
                  aria-describedby={errors.name ? errorId('name') : undefined}
                  aria-invalid={!!errors.name || undefined}
                  className="border-transparent bg-muted [&:hover:not(:focus)]:bg-selected dark:bg-muted"
                  id={fieldId('name')}
                  placeholder={t('createNewAiProvider.name.placeholder')}
                  value={field.value ?? ''}
                  visualSize="normal"
                />
              )}
              rules={{
                validate: (value) =>
                  requiredText.safeParse(value).success || t('createNewAiProvider.name.required'),
              }}
            />
            <FieldError className="text-xs leading-5" errors={[errors.name]} id={errorId('name')} />
          </Field>

          <Field>
            <FieldLabel className="text-sm leading-5.5" htmlFor={fieldId('description')}>
              {t('createNewAiProvider.description.title')}
            </FieldLabel>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <Textarea
                  {...field}
                  className="field-sizing-fixed min-h-18 resize-none border-transparent bg-muted [&:hover:not(:focus)]:bg-selected dark:bg-muted"
                  id={fieldId('description')}
                  placeholder={t('createNewAiProvider.description.placeholder')}
                  value={field.value ?? ''}
                />
              )}
            />
          </Field>

          <Field className="relative [&>[data-slot=button]]:w-9">
            <FieldLabel className="text-sm leading-5.5" htmlFor={fieldId('logo')}>
              {t('createNewAiProvider.logo.title')}
            </FieldLabel>
            <Controller
              control={control}
              name="logo"
              render={({ field }) => (
                <>
                  <Input
                    {...field}
                    className="border-transparent bg-muted pe-12 [&:hover:not(:focus)]:bg-selected dark:bg-muted [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:pe-14"
                    id={fieldId('logo')}
                    placeholder="https://logo-url"
                    value={field.value ?? ''}
                    visualSize="normal"
                  />
                  {field.value ? (
                    <Button
                      aria-controls={fieldId('logo')}
                      aria-label={`${t('clear', { ns: 'common' })}: ${t('createNewAiProvider.logo.title')}`}
                      className="absolute end-0 bottom-0 rounded-(--radius-button) text-muted-foreground [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
                      disabled={loading ? true : field.disabled}
                      size="icon-lg"
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        field.onChange('');
                        document.getElementById(fieldId('logo'))?.focus({ preventScroll: true });
                      }}
                    >
                      <X aria-hidden className="size-4" size={16} />
                    </Button>
                  ) : null}
                </>
              )}
            />
          </Field>

          <div className="mbs-2">
            <SectionTitle>{t('createNewAiProvider.configTitle')}</SectionTitle>
          </div>

          <Field data-invalid={!!errors.settings?.sdkType}>
            <FieldLabel className="text-sm leading-5.5" htmlFor={fieldId('settings.sdkType')}>
              <span aria-hidden className="text-destructive-text">
                *
              </span>
              {t('createNewAiProvider.sdkType.title')}
            </FieldLabel>
            <Controller
              control={control}
              name="settings.sdkType"
              render={({ field }) => (
                <Select
                  items={CUSTOM_PROVIDER_SDK_OPTIONS}
                  name={field.name}
                  value={field.value ?? null}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    aria-required
                    aria-invalid={!!errors.settings?.sdkType || undefined}
                    className="w-full border-transparent bg-muted [&:hover:not(:focus)]:bg-selected dark:bg-muted"
                    id={fieldId('settings.sdkType')}
                    ref={field.ref}
                    size="normal"
                    aria-describedby={
                      errors.settings?.sdkType ? errorId('settings.sdkType') : undefined
                    }
                    onBlur={field.onBlur}
                  >
                    <SelectValue placeholder={t('createNewAiProvider.sdkType.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_PROVIDER_SDK_OPTIONS.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <ProviderIcon
                            provider={value === 'router' ? 'newapi' : value}
                            size={16}
                          />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              rules={{
                validate: (value) =>
                  requiredText.safeParse(value).success ||
                  t('createNewAiProvider.sdkType.required'),
              }}
            />
            <FieldError
              className="text-xs leading-5"
              errors={[errors.settings?.sdkType]}
              id={errorId('settings.sdkType')}
            />
          </Field>
        </FieldGroup>
      </form>
      <ModalFooter className="mbs-4 border-bs border-divider p-0">
        <Button
          disabled={loading}
          size="normal"
          type="button"
          variant="destructive"
          onClick={handleDelete}
        >
          {t('delete', { ns: 'common' })}
        </Button>
        <Button form={formId} loading={loading} size="normal" type="submit">
          {t('update', { ns: 'common' })}
        </Button>
      </ModalFooter>
    </div>
  );
});

SettingContent.displayName = 'SettingContent';

export const createSettingModal = (props: SettingContentProps): ModalInstance =>
  createModal({
    content: <SettingContent {...props} />,
    footer: null,
    maskClosable: true,

    title: (
      <span className="flex items-center gap-2">
        <BrainIcon aria-hidden className="size-4" />
        {i18nT('updateCustomAiProvider.title', { ns: 'modelProvider' })}
      </span>
    ),
    width: 'min(90vw, 640px)',
  });
