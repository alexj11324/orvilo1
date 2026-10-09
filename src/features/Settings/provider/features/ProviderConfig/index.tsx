'use client';

import { AES_GCM_URL } from '@orvilo/const';
import { errorMessageFrom } from '@orvilo/utils/error';
import { useDebounceFn } from 'ahooks';
import { cn } from 'cn';
import { LockIcon } from 'lucide-react';
import { AiProviderBaseURLSchema } from 'model-bank/aiProvider';
import { type ReactNode } from 'react';
import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { FormInput, FormPassword } from '@/components/FormInput';
import Form, { type FormItemProps } from '@/components/GroupForm';
import { SkeletonInput } from '@/components/Skeleton';
import { toast } from '@/components/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/usePermission';
import { lambdaQuery } from '@/libs/trpc/client';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import {
  type AiProviderDetailItem,
  type AiProviderSourceType,
  type UpdateAiProviderConfigParams,
} from '@/types/aiProvider';
import { AiProviderSourceEnum } from '@/types/aiProvider';

import { KeyVaultsConfigKey, LLMProviderApiTokenKey, LLMProviderBaseUrlKey } from '../../const';
import { isResponsesApiSupportedSdkType } from '../providerSettings';
import { type CheckErrorRender } from './Checker';
import Checker from './Checker';
import CredentialsPanel, { type CredentialItem } from './CredentialsPanel';
import FormSwitch from './FormSwitch';
import OAuthDeviceFlowAuth from './OAuthDeviceFlowAuth';
import ProviderHeader, { ProviderHeaderActions, ProviderIdentity } from './ProviderHeader';
import {
  hasApiCredential,
  hasEndpoint,
  isPersistableBaseURL,
  resolveProviderStatus,
} from './providerStatus';

const SwitchSkeleton = () => <Skeleton className="h-[18px] w-8 rounded-full" />;

export interface ProviderConfigProps extends Omit<AiProviderDetailItem, 'enabled' | 'source'> {
  apiKeyItems?: FormItemProps[];
  apiKeyUrl?: string;
  canDeactivate?: boolean;
  checkErrorRender?: CheckErrorRender;
  className?: string;
  enabled?: boolean;
  extra?: ReactNode;
  hideSwitch?: boolean;
  modelList?: {
    azureDeployName?: boolean;
    notFoundContent?: ReactNode;
    placeholder?: string;
    showModelFetcher?: boolean;
  };
  normalizeConfigValues?: (values: UpdateAiProviderConfigParams) => UpdateAiProviderConfigParams;
  showAceGcm?: boolean;
  source?: AiProviderSourceType;
  title?: ReactNode;
}

const ProviderConfig = memo<ProviderConfigProps>(
  ({
    apiKeyItems,
    id,
    settings,
    checkModel,
    logo,
    className,
    checkErrorRender,
    canDeactivate = true,
    description,
    name,
    showAceGcm = true,
    extra,
    source = AiProviderSourceEnum.Builtin,
    apiKeyUrl,
    title,
    normalizeConfigValues,
  }) => {
    const {
      authType,
      proxyUrl,
      showApiKey = true,
      defaultShowBrowserRequest,
      disableBrowserRequest,
      showChecker = true,
      supportResponsesApi,
    } = settings || {};
    const { t } = useTranslation('modelProvider');
    const { t: tProviders } = useTranslation('providers');
    const [form] = Form.useForm();
    const { allowed: canManageProvider } = usePermission('manage_provider_key');

    const isOAuthProvider = authType === 'oauthDeviceFlow';

    // Query OAuth authentication status (only for OAuth providers)
    const { data: oauthStatus } = lambdaQuery.oauthDeviceFlow.getAuthStatus.useQuery(
      { providerId: id },
      { enabled: isOAuthProvider, refetchOnWindowFocus: true },
    );
    const isOAuthAuthenticated = oauthStatus?.status === 'ACTIVE';

    const [
      data,
      updateAiProviderConfig,
      enabled,
      isLoading,
      configUpdating,
      providerRuntimeConfig,
    ] = useAiInfraStore((s) => [
      aiProviderSelectors.providerDetailById(id)(s),
      s.updateAiProviderConfig,
      aiProviderSelectors.isProviderEnabled(id)(s),
      aiProviderSelectors.isAiProviderConfigLoading(id)(s),
      aiProviderSelectors.isProviderConfigUpdating(id)(s),
      aiProviderSelectors.providerConfigById(id)(s),
    ]);
    const enableBusinessFeatures = useServerConfigStore(
      serverConfigSelectors.enableBusinessFeatures,
    );

    // Watch form values in real-time to show/hide switches immediately
    // Watch nested form values for endpoints
    const formBaseURL = Form.useWatch(['keyVaults', 'baseURL'], form);
    const formEndpoint = Form.useWatch(['keyVaults', 'endpoint'], form);
    // Watch all possible credential fields for different providers
    const formApiKey = Form.useWatch(['keyVaults', 'apiKey'], form);
    const formAccessKeyId = Form.useWatch(['keyVaults', 'accessKeyId'], form);
    const formSecretAccessKey = Form.useWatch(['keyVaults', 'secretAccessKey'], form);
    const formUsername = Form.useWatch(['keyVaults', 'username'], form);
    const formPassword = Form.useWatch(['keyVaults', 'password'], form);

    // Stored credentials, from the runtime config with the detail payload as fallback.
    const keyVaults = providerRuntimeConfig?.keyVaults || data?.keyVaults;
    // The live form value wins over the stored one so the badge and switches
    // follow edits immediately, including clearing a field and an invalid
    // proxy URL that is never saved (see providerStatus.ts).
    const liveCredentials = {
      accessKeyId: formAccessKeyId,
      apiKey: formApiKey,
      baseURL: formBaseURL,
      endpoint: formEndpoint,
      password: formPassword,
      secretAccessKey: formSecretAccessKey,
      username: formUsername,
    };
    const isProviderEndpointNotEmpty = hasEndpoint(liveCredentials, keyVaults);
    // Covers apiKey (OpenAI, Azure, ...), AWS Bedrock keys and ComfyUI basic auth.
    const isProviderApiKeyNotEmpty = hasApiCredential(liveCredentials, keyVaults);

    // Track the last initialized provider ID to avoid resetting form during edits
    const lastInitializedIdRef = useRef<string | null>(null);

    useLayoutEffect(() => {
      if (isLoading) return;

      // Only initialize form when:
      // 1. First load (lastInitializedIdRef.current === null)
      // 2. Provider ID changed (switching between providers)
      const shouldInitialize = lastInitializedIdRef.current !== id;
      if (!shouldInitialize) return;

      // Merge data from both sources to ensure all fields are initialized correctly
      // data: contains basic info like apiKey, baseURL, fetchOnClient
      // providerRuntimeConfig: contains nested config like enableResponseApi
      const mergedData = {
        ...data,
        ...(providerRuntimeConfig?.config && { config: providerRuntimeConfig.config }),
      };

      // Clear the previous provider's field state first so omitted keys do not
      // leak old values when the next provider has empty credentials.
      form.resetFields();
      // Set form values and mark as initialized
      form.setFieldsValue(mergedData);
      lastInitializedIdRef.current = id;
    }, [isLoading, id, data, providerRuntimeConfig, form]);

    // Flag to indicate if a connection test is in progress
    const isCheckingConnection = useRef(false);

    const handleValueChange = useCallback(
      (...params: Parameters<typeof updateAiProviderConfig>) => {
        // Although debouncedHandleValueChange executes before onBeforeCheck,
        // due to the debounce, debouncedHandleValueChange will actually execute 500ms later
        // so isCheckingConnection.current has already been updated at this point
        // updateAiProviderConfig has already been triggered once during the connection test, so it should not be updated again
        if (isCheckingConnection.current) return;

        // Autosave runs from a debounce, so a rejection has nowhere to go but
        // an unhandled promise — tell the user the change did not stick.
        updateAiProviderConfig(...params).catch((error: unknown) => {
          toast.error(errorMessageFrom(error) || t('providerModels.config.saveFailed'));
        });
      },
      [t, updateAiProviderConfig],
    );

    const normalizeValues = useCallback(
      (values: UpdateAiProviderConfigParams) => normalizeConfigValues?.(values) ?? values,
      [normalizeConfigValues],
    );

    const { cancel: cancelDebouncedHandleValueChange, run: debouncedHandleValueChange } =
      useDebounceFn(handleValueChange, { wait: 500 });

    const isCustom = source === AiProviderSourceEnum.Custom;

    // OAuth auth change handler
    const handleOAuthChange = useCallback(async () => {
      // Only refresh provider data, don't update with form values
      // OAuth tokens are saved directly to DB by the tRPC endpoint
      await useAiInfraStore.getState().refreshAiProviderDetail();
      await useAiInfraStore.getState().refreshAiProviderRuntimeState();
    }, []);

    const apiKeyItem: FormItemProps[] =
      !showApiKey || isOAuthProvider
        ? []
        : (apiKeyItems ?? [
            {
              children: isLoading ? (
                <SkeletonInput />
              ) : (
                <FormPassword
                  autoComplete={'new-password'}
                  placeholder={t('providerModels.config.apiKey.placeholder', { name })}
                />
              ),
              desc: apiKeyUrl ? (
                <Trans
                  i18nKey="providerModels.config.apiKey.descWithUrl"
                  ns={'modelProvider'}
                  values={{ name }}
                  components={[
                    <span key="0" />,
                    <span key="1" />,
                    <span key="2" />,
                    <a href={apiKeyUrl} key="3" rel="noreferrer" target="_blank" />,
                  ]}
                />
              ) : (
                t(`providerModels.config.apiKey.desc`, { name })
              ),
              label: t(`providerModels.config.apiKey.title`),
              name: [KeyVaultsConfigKey, LLMProviderApiTokenKey],
            },
          ]);

    const showEndpoint = !!proxyUrl || isCustom;

    const endpointItem = showEndpoint
      ? {
          children: isLoading ? (
            <SkeletonInput />
          ) : (
            <FormInput
              placeholder={
                (!!proxyUrl && proxyUrl?.placeholder) ||
                t('providerModels.config.baseURL.placeholder')
              }
            />
          ),
          desc: (!!proxyUrl && proxyUrl?.desc) || t('providerModels.config.baseURL.desc'),
          label: (!!proxyUrl && proxyUrl?.title) || t('providerModels.config.baseURL.title'),
          name: [KeyVaultsConfigKey, LLMProviderBaseUrlKey],
          rules: [
            {
              validator: (_: any, value: string) => {
                if (!value) return;

                return AiProviderBaseURLSchema.safeParse(value).error
                  ? Promise.reject(t('providerModels.config.baseURL.invalid'))
                  : Promise.resolve();
              },
            },
          ],
        }
      : undefined;

    /*
     * Conditions to show Client Fetch Switch
     * 1. provider is not disabled browser request
     * 2. provider show browser request by default
     * 3. Provider allow to edit endpoint and the value of endpoint is not empty
     * 4. There is an apikey provided by user
     */
    const showClientFetch =
      !disableBrowserRequest &&
      (defaultShowBrowserRequest ||
        (showEndpoint && isProviderEndpointNotEmpty) ||
        (showApiKey && isProviderApiKeyNotEmpty));

    const clientFetchItem = showClientFetch
      ? {
          children: isLoading ? (
            <SwitchSkeleton />
          ) : (
            <FormSwitch
              aria-label={t('providerModels.config.fetchOnClient.title')}
              loading={configUpdating}
            />
          ),
          desc: t('providerModels.config.fetchOnClient.desc'),
          label: t('providerModels.config.fetchOnClient.title'),
          name: 'fetchOnClient',
          valuePropName: 'checked',
        }
      : undefined;

    const showResponsesApiSwitch =
      !!supportResponsesApi || (isCustom && isResponsesApiSupportedSdkType(settings?.sdkType));

    const configItems = [
      ...apiKeyItem,
      endpointItem,
      showResponsesApiSwitch
        ? {
            children: isLoading ? (
              <SwitchSkeleton />
            ) : (
              <FormSwitch
                aria-label={t('providerModels.config.responsesApi.title')}
                loading={configUpdating}
              />
            ),
            desc: t('providerModels.config.responsesApi.desc'),
            label: t('providerModels.config.responsesApi.title'),
            name: ['config', 'enableResponseApi'],
            valuePropName: 'checked',
          }
        : undefined,
      clientFetchItem,
      showChecker
        ? {
            node: isLoading ? (
              <div className="border-t border-border bg-accent px-4 py-3">
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <Checker
                checkErrorRender={checkErrorRender}
                model={data?.checkModel || checkModel!}
                provider={id}
                missingCredentials={
                  showApiKey &&
                  !isOAuthProvider &&
                  !isProviderApiKeyNotEmpty &&
                  !isProviderEndpointNotEmpty
                }
                onAfterCheck={async () => {
                  // Reset connection test state to allow subsequent onValuesChange updates
                  isCheckingConnection.current = false;
                }}
                onBeforeCheck={async () => {
                  try {
                    await form.validateFields();
                  } catch {
                    return false;
                  }

                  // Set connection test state to prevent duplicate requests from onValuesChange
                  isCheckingConnection.current = true;
                  // Proactively save the latest form values to ensure fetchAiProviderRuntimeState retrieves up-to-date data
                  await updateAiProviderConfig(id, normalizeValues(form.getFieldsValue()));

                  return true;
                }}
              />
            ),
          }
        : undefined,
    ].filter(Boolean) as CredentialItem[];

    const logoUrl = data?.logo ?? logo;

    const status = resolveProviderStatus({
      enabled,
      hasApiKey: isProviderApiKeyNotEmpty,
      hasProviderEndpoint: isProviderEndpointNotEmpty,
      isOAuthAuthenticated,
    });

    const descriptionText = isCustom
      ? description
      : description && tProviders(`${id}.description`, { defaultValue: description });

    const identity = (
      <ProviderIdentity
        enabled={enabled}
        id={id}
        isCustom={isCustom}
        isOAuthProvider={isOAuthProvider}
        logoUrl={logoUrl}
        name={name}
        title={title}
      />
    );

    const headerProps = {
      canDeactivate,
      enableBusinessFeatures,
      extra,
      id,
      isCustom,
      isOAuthProvider,
    };

    // For OAuth providers, only show Form when authenticated
    const shouldShowForm = !isOAuthProvider || isOAuthAuthenticated;

    return (
      <>
        {isOAuthProvider ? (
          <OAuthDeviceFlowAuth
            // when the provider cannot be deactivated there is no switch to
            // gate on, so the connect action stays available
            enabled={!canDeactivate || enabled}
            extra={<ProviderHeaderActions {...headerProps} withHelpDoc />}
            providerId={id}
            title={identity}
            onAuthChange={handleOAuthChange}
          />
        ) : (
          <ProviderHeader
            {...headerProps}
            description={descriptionText}
            enabled={enabled}
            identity={identity}
            status={status}
          />
        )}
        {shouldShowForm && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">
              {t('providerModels.config.credentials.title')}
            </h2>
            <Form
              className={cn('w-full', className)}
              disabled={!canManageProvider}
              form={form}
              onValuesChange={(_, values) => {
                if (!canManageProvider) return;

                cancelDebouncedHandleValueChange();
                // An invalid proxy URL is never written (and the pending save is dropped).
                if (!isPersistableBaseURL(values.keyVaults?.baseURL)) return;

                debouncedHandleValueChange(id, normalizeValues(values));
              }}
            >
              <CredentialsPanel items={configItems} />
              {showAceGcm && (
                <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100">
                  <LockIcon className="size-3" />
                  <Trans
                    i18nKey="providerModels.config.aesGcm"
                    ns={'modelProvider'}
                    components={[
                      <span key="0" />,
                      <a
                        className="mx-1 rounded-sm underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        href={AES_GCM_URL}
                        key="1"
                        rel="noreferrer"
                        target="_blank"
                      />,
                    ]}
                  />
                </p>
              )}
            </Form>
          </section>
        )}
      </>
    );
  },
);

export default ProviderConfig;
