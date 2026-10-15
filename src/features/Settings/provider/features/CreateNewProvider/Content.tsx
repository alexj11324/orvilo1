'use client';

import { Eye, EyeOff, X } from 'lucide-react';
import { AiProviderBaseURLSchema } from 'model-bank/aiProvider';
import { type ComponentProps, useRef, useState } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useFormControlContext } from '@/components/FormControlContext';
import Form from '@/components/GroupForm';
import { useModalContext } from '@/components/Modal';
import { ProviderIcon } from '@/components/OrviloIcons';
import Select from '@/components/Select';
import { Button } from '@/components/ui/button';
import { Input as NativeInput } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAiInfraStore } from '@/store/aiInfra/store';
import { type CreateAiProviderParams } from '@/types/aiProvider';

import { KeyVaultsConfigKey, LLMProviderApiTokenKey, LLMProviderBaseUrlKey } from '../../const';
import { CUSTOM_PROVIDER_SDK_OPTIONS } from '../customProviderSdkOptions';
import { useCreateProvider } from './useCreateProvider';

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-muted-foreground">{children}</span>
);

interface ProviderInputProps extends Omit<
  ComponentProps<typeof NativeInput>,
  'onChange' | 'value'
> {
  allowClear?: boolean;
  onChange?: (value: string) => void;
  password?: boolean;
  status?: 'error' | 'warning';
  value?: string;
  variant?: 'filled';
}
/** Form-bound immediate values; clear/reveal buttons never submit the form. */
const ProviderInput = ({
  allowClear,
  password,
  onChange,
  value = '',
  disabled,
  status,
  variant: _variant,
  ...props
}: ProviderInputProps) => {
  const { t } = useTranslation(['common', 'auth']);
  const control = useFormControlContext();
  const resolvedDisabled = disabled ?? control.disabled;
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative w-full">
      <NativeInput
        {...props}
        aria-invalid={status === 'error' || undefined}
        className="border-transparent bg-secondary pe-10"
        disabled={resolvedDisabled}
        ref={inputRef}
        type={password && !visible ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {(password || (allowClear && value !== '')) && (
        <Button
          aria-pressed={password ? visible : undefined}
          className="absolute inset-y-0 end-1 my-auto"
          disabled={resolvedDisabled}
          size="icon-sm"
          type="button"
          variant="ghost"
          aria-label={
            password
              ? t(visible ? 'betterAuth.signin.hidePassword' : 'betterAuth.signin.showPassword', {
                  ns: 'auth',
                })
              : t('clear', { ns: 'common' })
          }
          onClick={() => {
            if (resolvedDisabled) return;
            if (password) setVisible((current) => !current);
            else onChange?.('');
            inputRef.current?.focus();
          }}
        >
          {password ? visible ? <EyeOff aria-hidden /> : <Eye aria-hidden /> : <X aria-hidden />}
        </Button>
      )}
    </div>
  );
};

const CreateNewProviderContent = memo(() => {
  const { t } = useTranslation('modelProvider');
  const [form] = Form.useForm<CreateAiProviderParams>();
  const { close } = useModalContext();
  const { loading, onFinish } = useCreateProvider(close);

  const itemStyle = { marginBottom: 0 };

  return (
    <Form
      colon={false}
      form={form}
      layout={'vertical'}
      scrollToFirstError={{ behavior: 'instant', block: 'end', focus: true }}
      onFinish={onFinish}
    >
      <div className="flex flex-col gap-4">
        <SectionTitle>{t('createNewAiProvider.basicTitle')}</SectionTitle>

        <Form.Item
          extra={t('createNewAiProvider.id.desc')}
          label={t('createNewAiProvider.id.title')}
          name={'id'}
          style={itemStyle}
          rules={[
            { message: t('createNewAiProvider.id.required'), required: true },
            {
              message: t('createNewAiProvider.id.format'),
              pattern: /^[\d_a-z-]+$/,
            },
            {
              message: t('createNewAiProvider.id.duplicate'),
              validator: (_, value: string) => {
                const list = useAiInfraStore.getState().aiProviderList;
                if (value && list.some((p) => p.id === value)) {
                  return Promise.reject();
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <ProviderInput
            autoFocus
            placeholder={t('createNewAiProvider.id.placeholder')}
            variant={'filled'}
          />
        </Form.Item>

        <Form.Item label={t('createNewAiProvider.name.title')} name={'name'} style={itemStyle}>
          <ProviderInput
            placeholder={t('createNewAiProvider.name.placeholder')}
            variant={'filled'}
          />
        </Form.Item>

        <Form.Item
          label={t('createNewAiProvider.description.title')}
          name={'description'}
          style={itemStyle}
        >
          <Textarea
            className="min-h-18 border-transparent bg-secondary"
            placeholder={t('createNewAiProvider.description.placeholder')}
          />
        </Form.Item>

        <Form.Item label={t('createNewAiProvider.logo.title')} name={'logo'} style={itemStyle}>
          <ProviderInput
            allowClear
            placeholder={t('createNewAiProvider.logo.placeholder')}
            variant={'filled'}
          />
        </Form.Item>

        <div className="mt-2">
          <SectionTitle>{t('createNewAiProvider.configTitle')}</SectionTitle>
        </div>

        <Form.Item
          label={t('createNewAiProvider.sdkType.title')}
          name={['settings', 'sdkType']}
          rules={[{ message: t('createNewAiProvider.sdkType.required'), required: true }]}
          style={itemStyle}
        >
          <Select
            className="border-transparent bg-secondary"
            options={CUSTOM_PROVIDER_SDK_OPTIONS}
            placeholder={t('createNewAiProvider.sdkType.placeholder')}
            optionRender={({ label, value }) => {
              const iconProvider = value === 'router' ? 'newapi' : (value as string);
              return (
                <div className="flex items-center gap-2">
                  <ProviderIcon provider={iconProvider} size={18} />
                  {label}
                </div>
              );
            }}
          />
        </Form.Item>

        <Form.Item
          label={t('createNewAiProvider.proxyUrl.title')}
          name={[KeyVaultsConfigKey, LLMProviderBaseUrlKey]}
          style={itemStyle}
          rules={[
            { message: t('createNewAiProvider.proxyUrl.required'), required: true },
            {
              validator: (_, value: string) =>
                !value || AiProviderBaseURLSchema.safeParse(value).success
                  ? Promise.resolve()
                  : Promise.reject(t('providerModels.config.baseURL.invalid')),
            },
          ]}
        >
          <ProviderInput
            allowClear
            placeholder={t('createNewAiProvider.proxyUrl.placeholder')}
            variant={'filled'}
          />
        </Form.Item>

        <Form.Item
          label={t('createNewAiProvider.apiKey.title')}
          name={[KeyVaultsConfigKey, LLMProviderApiTokenKey]}
          style={itemStyle}
        >
          <ProviderInput
            password
            autoComplete={'new-password'}
            placeholder={t('createNewAiProvider.apiKey.placeholder')}
            variant={'filled'}
          />
        </Form.Item>

        <Button className="w-full" loading={loading} type="submit">
          {t('createNewAiProvider.confirm')}
        </Button>
      </div>
    </Form>
  );
});

export default CreateNewProviderContent;
