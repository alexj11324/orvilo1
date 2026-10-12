'use client';

import { type NetworkProxySettings } from '@orvilo/electron-client-ipc';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormPassword } from '@/components/FormInput';
import SettingsSectionSkeleton from '@/components/Skeleton/Settings/Section';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { desktopSettingsService } from '@/services/electron/settings';
import { useElectronStore } from '@/store/electron';

import {
  activeProxyValues,
  PROXY_TYPES,
  type ProxyDraft,
  validateProxySettings,
} from './proxyValidation';
import SaveBar from './SaveBar';
import { useProxyDirty } from './useProxyDirty';

const ProxyForm = () => {
  const { t } = useTranslation('electron');
  const id = useId();
  const {
    control,
    reset,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<ProxyDraft>({ defaultValues: {}, mode: 'onChange', shouldUnregister: false });
  const values = useWatch({ control });
  const isEnableProxy = values.enableProxy;
  const proxyRequireAuth = values.proxyRequireAuth;
  const [testUrl, setTestUrl] = useState('https://www.google.com');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [setProxySettings, useGetProxySettings] = useElectronStore((s) => [
    s.setProxySettings,
    s.useGetProxySettings,
  ]);
  const { data: proxySettings, isLoading } = useGetProxySettings();
  const { isDirty } = useProxyDirty(activeProxyValues(values), proxySettings);
  const initializedRef = useRef(false);
  useEffect(() => {
    if (proxySettings && !initializedRef.current) {
      reset(proxySettings);
      initializedRef.current = true;
    }
  }, [reset, proxySettings]);

  const validateDraft = useCallback(() => {
    const current = activeProxyValues(getValues());
    const issues = validateProxySettings(current);
    clearErrors();
    for (const name of Object.keys(issues) as (keyof ProxyDraft)[]) {
      setError(name, { type: 'validate', message: t(issues[name]!) });
    }
    return Object.keys(issues).length ? undefined : current;
  }, [getValues, clearErrors, setError, t]);

  const handleEnableChange = (next: boolean) => {
    // onValuesChange used the mounted fields before the new switch state rendered.
    const current = { ...activeProxyValues(getValues()), enableProxy: next };
    setValue('enableProxy', next);
    if (next && Object.keys(validateProxySettings(current)).length) return;
    setProxySettings(next ? current : { enableProxy: false }).catch((error) => {
      setValue('enableProxy', !next);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t('proxy.saveFailed', { error: message }));
    });
  };

  const handleSave = async () => {
    const current = validateDraft();
    if (!current) return;
    try {
      setIsSaving(true);
      await setProxySettings(current);
      toast.success(t('proxy.saveSuccess'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t('proxy.saveFailed', { error: message }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setIsTesting(true);
      const current = validateDraft();
      if (!current) return;
      const config: NetworkProxySettings = { ...proxySettings, ...current };
      const result = await desktopSettingsService.testProxyConfig(config, testUrl);
      if (result.success)
        toast.success(t('proxy.testSuccessWithTime', { time: result.responseTime }));
      else toast.error(`${t('proxy.testFailed')}: ${result.message ?? ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`${t('proxy.testFailed')}: ${message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const rules = <Name extends keyof ProxyDraft>(name: Name) => ({
    validate: (value: ProxyDraft[Name]) => {
      const issue = validateProxySettings({ ...getValues(), [name]: value })[name];
      return issue ? t(issue) : true;
    },
  });
  const fieldId = (name: string) => `${id}-${name}`;
  const descriptionId = (name: string) => `${fieldId(name)}-description`;
  const errorId = (name: string) => `${fieldId(name)}-error`;
  const describedBy = (name: keyof ProxyDraft, description?: string) =>
    [
      description && errors[name]?.message !== description && descriptionId(name),
      errors[name] && errorId(name),
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  const row = (
    name: keyof ProxyDraft,
    label: ReactNode,
    child: ReactNode,
    description?: string,
    disabled?: boolean,
  ) => (
    <Field
      data-disabled={disabled || undefined}
      data-invalid={!!errors[name]}
      orientation="horizontal"
    >
      <FieldContent className="min-w-[max(34%,240px)]">
        <FieldLabel htmlFor={fieldId(name)}>{label}</FieldLabel>
        {description && errors[name]?.message !== description && (
          <FieldDescription className="text-xs" id={descriptionId(name)}>
            {description}
          </FieldDescription>
        )}
      </FieldContent>
      <div className="min-w-0 flex-1">
        {child}
        <FieldError errors={[errors[name]]} id={errorId(name)} />
      </div>
    </Field>
  );
  const section = (title: string, children: ReactNode) => (
    <FieldSet>
      <FieldLegend className="font-semibold">{title}</FieldLegend>
      <FieldGroup className="gap-2 rounded-2xl bg-secondary p-4 [&>[data-slot=field]]:min-h-11 [&>[data-slot=field]]:py-2">
        {children}
      </FieldGroup>
    </FieldSet>
  );
  const textInput = (
    name: 'proxyServer' | 'proxyPort' | 'proxyUsername',
    placeholder: string,
    disabled = false,
    description?: string,
  ) => (
    <Controller
      control={control}
      name={name}
      rules={rules(name)}
      render={({ field }) => (
        <Input
          {...field}
          aria-describedby={describedBy(name, description)}
          aria-invalid={!!errors[name] || undefined}
          className={name === 'proxyPort' ? 'w-30' : undefined}
          disabled={disabled}
          id={fieldId(name)}
          placeholder={placeholder}
          value={field.value ?? ''}
        />
      )}
    />
  );

  if (isLoading) return <SettingsSectionSkeleton />;

  return (
    <>
      <form
        className="flex w-full max-w-5xl flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          // The previous Form validated Enter submissions without saving settings.
          validateDraft();
        }}
      >
        {section(
          t('proxy.enable'),
          row(
            'enableProxy',
            <SettingsSearchAnchor id="proxy-enable">{t('proxy.enable')}</SettingsSearchAnchor>,
            <Controller
              control={control}
              name="enableProxy"
              render={({ field }) => (
                <Switch
                  aria-describedby={descriptionId('enableProxy')}
                  checked={field.value ?? false}
                  id={fieldId('enableProxy')}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  onCheckedChange={handleEnableChange}
                />
              )}
            />,
            t('proxy.enableDesc'),
          ),
        )}
        {section(
          t('proxy.basicSettings'),
          <>
            {row(
              'proxyType',
              t('proxy.type'),
              <Controller
                control={control}
                name="proxyType"
                rules={rules('proxyType')}
                render={({ field }) => (
                  <RadioGroup
                    aria-describedby={describedBy('proxyType')}
                    aria-invalid={!!errors.proxyType || undefined}
                    aria-label={t('proxy.type')}
                    className="flex gap-4"
                    disabled={!isEnableProxy}
                    id={fieldId('proxyType')}
                    name={field.name}
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onValueChange={field.onChange}
                  >
                    {PROXY_TYPES.map((type) => (
                      <label className="flex items-center gap-2" key={type}>
                        <RadioGroupItem value={type} />
                        {type.toUpperCase()}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />,
              undefined,
              !isEnableProxy,
            )}
            {row(
              'proxyServer',
              t('proxy.server'),
              textInput(
                'proxyServer',
                '127.0.0.1',
                !isEnableProxy,
                t('proxy.validation.serverRequired'),
              ),
              t('proxy.validation.serverRequired'),
              !isEnableProxy,
            )}
            {row(
              'proxyPort',
              t('proxy.port'),
              textInput('proxyPort', '7890', !isEnableProxy, t('proxy.validation.portRequired')),
              t('proxy.validation.portRequired'),
              !isEnableProxy,
            )}
          </>,
        )}
        {section(
          t('proxy.authSettings'),
          <>
            {row(
              'proxyRequireAuth',
              <SettingsSearchAnchor id="proxy-auth">{t('proxy.auth')}</SettingsSearchAnchor>,
              <Controller
                control={control}
                name="proxyRequireAuth"
                render={({ field }) => (
                  <Switch
                    aria-describedby={descriptionId('proxyRequireAuth')}
                    checked={field.value ?? false}
                    disabled={!isEnableProxy}
                    id={fieldId('proxyRequireAuth')}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                  />
                )}
              />,
              t('proxy.authDesc'),
              !isEnableProxy,
            )}
            {proxyRequireAuth && isEnableProxy && (
              <>
                {row(
                  'proxyUsername',
                  t('proxy.username'),
                  textInput('proxyUsername', t('proxy.username_placeholder')),
                )}
                {row(
                  'proxyPassword',
                  t('proxy.password'),
                  <Controller
                    control={control}
                    name="proxyPassword"
                    rules={rules('proxyPassword')}
                    render={({ field }) => (
                      // FormPassword commits its local edit on blur/Enter. Spreading field.onBlur would replace that handler.
                      <FormPassword
                        aria-describedby={describedBy('proxyPassword')}
                        autoComplete="new-password"
                        id={fieldId('proxyPassword')}
                        name={field.name}
                        placeholder={t('proxy.password_placeholder')}
                        status={errors.proxyPassword ? 'error' : undefined}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    )}
                  />,
                )}
              </>
            )}
          </>,
        )}
        {section(
          t('proxy.connectionTest'),
          <Field orientation="horizontal">
            <FieldContent className="min-w-[max(34%,240px)]">
              <FieldLabel htmlFor={fieldId('testUrl')}>
                <SettingsSearchAnchor id="proxy-test">{t('proxy.testUrl')}</SettingsSearchAnchor>
              </FieldLabel>
              <FieldDescription className="text-xs" id={descriptionId('testUrl')}>
                {t('proxy.testDescription')}
              </FieldDescription>
            </FieldContent>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                aria-describedby={descriptionId('testUrl')}
                className="flex-1"
                id={fieldId('testUrl')}
                placeholder={t('proxy.testUrlPlaceholder')}
                value={testUrl}
                onChange={(event) => setTestUrl(event.target.value)}
              />
              <Button
                aria-busy={isTesting}
                disabled={isTesting}
                type="button"
                variant="outline"
                onClick={handleTest}
              >
                {isTesting && <Spinner />}
                {t('proxy.testButton')}
              </Button>
            </div>
          </Field>,
        )}
      </form>
      <SaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={() => {
          if (proxySettings) reset({ ...getValues(), ...proxySettings });
        }}
      />
    </>
  );
};

export default ProxyForm;
