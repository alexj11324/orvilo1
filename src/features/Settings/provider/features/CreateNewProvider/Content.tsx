'use client';

import { Flexbox } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { AiProviderBaseURLSchema } from 'model-bank/aiProvider';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { FormPassword } from '@/components/FormInput';
import Form from '@/components/GroupForm';
import { useModalContext } from '@/components/Modal';
import { ProviderIcon } from '@/components/OrviloIcons';
import Select from '@/components/Select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAiInfraStore } from '@/store/aiInfra/store';
import { type CreateAiProviderParams } from '@/types/aiProvider';

import { KeyVaultsConfigKey, LLMProviderApiTokenKey, LLMProviderBaseUrlKey } from '../../const';
import { CUSTOM_PROVIDER_SDK_OPTIONS } from '../customProviderSdkOptions';
import { useCreateProvider } from './useCreateProvider';

const SectionTitle = memo<{ children: React.ReactNode }>(({ children }) => (
  <Text fontSize={13} type={'secondary'} weight={500}>
    {children}
  </Text>
));

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
      <Flexbox gap={16}>
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
          <Input autoFocus placeholder={t('createNewAiProvider.id.placeholder')} />
        </Form.Item>

        <Form.Item label={t('createNewAiProvider.name.title')} name={'name'} style={itemStyle}>
          <Input placeholder={t('createNewAiProvider.name.placeholder')} />
        </Form.Item>

        <Form.Item
          label={t('createNewAiProvider.description.title')}
          name={'description'}
          style={itemStyle}
        >
          <Textarea
            placeholder={t('createNewAiProvider.description.placeholder')}
            style={{ minHeight: 72 }}
          />
        </Form.Item>

        <Form.Item label={t('createNewAiProvider.logo.title')} name={'logo'} style={itemStyle}>
          <Input placeholder={t('createNewAiProvider.logo.placeholder')} />
        </Form.Item>

        <div style={{ marginBlockStart: 8 }}>
          <SectionTitle>{t('createNewAiProvider.configTitle')}</SectionTitle>
        </div>

        <Form.Item
          label={t('createNewAiProvider.sdkType.title')}
          name={['settings', 'sdkType']}
          rules={[{ message: t('createNewAiProvider.sdkType.required'), required: true }]}
          style={itemStyle}
        >
          <Select
            className="w-full"
            options={CUSTOM_PROVIDER_SDK_OPTIONS}
            placeholder={t('createNewAiProvider.sdkType.placeholder')}
            optionRender={({ label, value }) => {
              const iconProvider = value === 'router' ? 'newapi' : (value as string);
              return (
                <Flexbox horizontal align={'center'} gap={8}>
                  <ProviderIcon provider={iconProvider} size={18} />
                  {label}
                </Flexbox>
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
          <Input placeholder={t('createNewAiProvider.proxyUrl.placeholder')} />
        </Form.Item>

        <Form.Item
          label={t('createNewAiProvider.apiKey.title')}
          name={[KeyVaultsConfigKey, LLMProviderApiTokenKey]}
          style={itemStyle}
        >
          <FormPassword
            autoComplete={'new-password'}
            placeholder={t('createNewAiProvider.apiKey.placeholder')}
          />
        </Form.Item>

        <Button className="w-full" loading={loading} type={'submit'}>
          {t('createNewAiProvider.confirm')}
        </Button>
      </Flexbox>
    </Form>
  );
});

export default CreateNewProviderContent;
