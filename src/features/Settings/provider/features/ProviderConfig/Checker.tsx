'use client';

import { Highlighter } from '@lobehub/ui';
import { type ChatMessageError } from '@orvilo/types';
import { TraceNameMap } from '@orvilo/types';
import { isRecord, pickTrimmedString } from '@orvilo/utils/object';
import { CheckIcon, CircleAlertIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelIcon } from '@/components/OrviloIcons';
import { Badge } from '@/components/reui/badge';
import Select from '@/components/Select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { useProviderName } from '@/hooks/useProviderName';
import { chatService } from '@/services/chat';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { getRuntimeErrorMessage } from '@/utils/locale/runtimeErrorMessage';

import { FieldRow } from './CredentialsPanel';

const Error = memo<{ error: ChatMessageError }>(({ error }) => {
  const { t } = useTranslation(['error', 'modelRuntime']);
  const providerName = useProviderName(error.body?.provider);
  const bodyMessage = isRecord(error.body)
    ? pickTrimmedString(error.body.message)
    : pickTrimmedString(error.body);
  const fallbackMessage =
    pickTrimmedString(error.message) ?? bodyMessage ?? t('response.UnknownChatFetchError');

  return (
    <Alert className="w-full max-w-[600px]" variant="destructive">
      <CircleAlertIcon />
      <AlertTitle className="line-clamp-none">
        {getRuntimeErrorMessage(t, error.type, { provider: providerName }, fallbackMessage)}
      </AlertTitle>
      <AlertDescription className="w-full pt-2">
        <Highlighter actionIconSize={'small'} language={'json'} variant={'borderless'} wrap={true}>
          {JSON.stringify(error.body || error, null, 2)}
        </Highlighter>
      </AlertDescription>
    </Alert>
  );
});

export type CheckErrorRender = (props: {
  defaultError: ReactNode;
  error?: ChatMessageError;
  setError: (error?: ChatMessageError) => void;
}) => ReactNode;

interface ConnectionCheckerProps {
  checkErrorRender?: CheckErrorRender;
  /** True when the provider needs a key or endpoint and none is filled in yet. */
  missingCredentials?: boolean;
  model: string;
  onAfterCheck: () => Promise<void>;
  onBeforeCheck: () => Promise<boolean>;
  provider: string;
}

const Checker = memo<ConnectionCheckerProps>(
  ({
    model,
    provider,
    missingCredentials,
    checkErrorRender: CheckErrorRender,
    onBeforeCheck,
    onAfterCheck,
  }) => {
    const { t } = useTranslation('setting');
    const { t: tProvider } = useTranslation('modelProvider');
    const { allowed: canManageProvider } = usePermission('manage_provider_key');

    const [isProviderConfigUpdating, updateAiProviderConfig] = useAiInfraStore((s) => [
      aiProviderSelectors.isProviderConfigUpdating(provider)(s),
      s.updateAiProviderConfig,
    ]);
    const aiProviderModelList = useAiInfraStore((s) => s.aiProviderModelList);

    // Sort models for better UX:
    // 1. checkModel first (provider's recommended test model)
    // 2. enabled models (user is actively using)
    // 3. by releasedAt descending (newer models first)
    // 4. models without releasedAt last
    const sortedModels = useMemo(() => {
      const chatModels = aiProviderModelList.filter((m) => m.type === 'chat');

      const sorted = [...chatModels].sort((a, b) => {
        // checkModel always first
        if (a.id === model) return -1;
        if (b.id === model) return 1;

        // enabled models come before disabled
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;

        // sort by releasedAt descending, models without releasedAt go last
        if (a.releasedAt && b.releasedAt) {
          return new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime();
        }
        if (a.releasedAt && !b.releasedAt) return -1;
        if (!a.releasedAt && b.releasedAt) return 1;

        return 0;
      });

      return sorted.map((m) => m.id);
    }, [aiProviderModelList, model]);

    const [loading, setLoading] = useState(false);
    const [pass, setPass] = useState(false);
    const [checkModel, setCheckModel] = useState(model);

    const [error, setError] = useState<ChatMessageError | undefined>();
    // Set when Check is pressed without credentials; it only shows while they are still missing.
    const [triedWithoutCredentials, setTriedWithoutCredentials] = useState(false);
    const showMissingCredentials = !!missingCredentials && triedWithoutCredentials;

    // Sync checkModel state when model prop changes
    useEffect(() => {
      setCheckModel(model);
    }, [model]);

    const checkConnection = async () => {
      // Clear previous check results immediately
      setPass(false);
      setError(undefined);

      let isError = false;

      await chatService.fetchPresetTaskResult({
        onError: (_, rawError) => {
          setError(rawError);
          setPass(false);
          isError = true;
        },

        onFinish: async (value) => {
          if (!isError && value) {
            setError(undefined);
            setPass(true);
          } else {
            setPass(false);
            setError({
              body: value,
              message: getRuntimeErrorMessage(t, 'ConnectionCheckFailed'),
              type: 'ConnectionCheckFailed',
            });
          }
        },
        onLoadingChange: (loading) => {
          setLoading(loading);
        },
        params: {
          messages: [
            {
              content: 'hello',
              role: 'user',
            },
          ],
          model: checkModel,
          provider,
        },
        trace: {
          sessionId: `connection:${provider}`,
          topicId: checkModel,
          traceName: TraceNameMap.ConnectivityChecker,
        },
      });
    };

    const defaultError = error ? <Error error={error as ChatMessageError} /> : null;

    const missingCredentialsContent = (
      <Alert className="w-full max-w-[600px]" variant="destructive">
        <CircleAlertIcon />
        <AlertTitle className="line-clamp-none">
          {tProvider('providerModels.config.checker.missingCredentials')}
        </AlertTitle>
      </Alert>
    );

    const errorContent = CheckErrorRender ? (
      <CheckErrorRender defaultError={defaultError} error={error} setError={setError} />
    ) : (
      defaultError
    );

    return (
      <FieldRow
        className="bg-accent"
        desc={tProvider('providerModels.config.checker.desc')}
        label={tProvider('providerModels.config.checker.title')}
        footer={
          showMissingCredentials ? missingCredentialsContent : error ? errorContent : undefined
        }
      >
        {pass && (
          <Badge variant="success-light">
            <CheckIcon />
            {t('llm.checker.pass')}
          </Badge>
        )}
        <Select
          showSearch
          aria-label={tProvider('providerModels.config.checker.title')}
          className="w-[180px] min-w-0"
          disabled={!canManageProvider}
          loading={isProviderConfigUpdating}
          options={sortedModels.map((id) => ({ label: id, value: id }))}
          size="sm"
          value={checkModel}
          optionRender={({ value }) => (
            <span className="flex items-center gap-1.5">
              <ModelIcon model={value as string} size={20} />
              {value}
            </span>
          )}
          onChange={async (value) => {
            if (!canManageProvider || typeof value !== 'string') return;

            // Update local state
            setCheckModel(value);
            setPass(false);
            setError(undefined);

            // Persist the selected model to provider config
            // This allows the model to be retained after page refresh
            await updateAiProviderConfig(provider, { checkModel: value });
          }}
        />
        <Button
          disabled={!canManageProvider || isProviderConfigUpdating}
          loading={loading}
          size="sm"
          variant="outline"
          onClick={async () => {
            if (!canManageProvider) return;

            // Nothing to check against: say so instead of sending a request
            // that can only fail slowly and silently.
            if (missingCredentials) {
              setPass(false);
              setError(undefined);
              setTriedWithoutCredentials(true);
              return;
            }
            setTriedWithoutCredentials(false);

            try {
              const shouldCheck = await onBeforeCheck();
              if (!shouldCheck) return;

              await checkConnection();
            } finally {
              await onAfterCheck();
            }
          }}
        >
          {t('llm.checker.button')}
        </Button>
      </FieldRow>
    );
  },
);

export default Checker;
