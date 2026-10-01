import { Flexbox } from '@lobehub/ui';
import { Button, confirmModal, Input, Select, Text } from '@lobehub/ui/base-ui';
import {
  type ProviderBinding,
  type ProviderBindingConfig,
  providerBindingConfigSchema,
} from '@orvilo/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import {
  providerBindingActions,
  useFetchProviderBindings,
  useProviderBindingStore,
} from '@/store/providerBinding';

import { useBindingFeedback } from './useBindingFeedback';

const selectionOptions = {
  runtime: ['orvilo', 'claude-code', 'codex'],
  engine: ['claude-sdk', 'codex-app-server'],
  effort: ['default', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  mode: ['default', 'low', 'medium', 'high', 'ultra'],
  speed: ['default', 'fast'],
  target: ['local', 'device', 'sandbox'],
};

const initial: ProviderBindingConfig = {
  name: '',
  provider: 'openai',
  model: '',
  endpoint: 'https://api.openai.com/v1',
  secretReference: '',
  enabled: false,
  selection: {
    runtime: 'orvilo',
    engine: 'claude-sdk',
    effort: 'default',
    mode: 'default',
    speed: 'default',
    target: 'sandbox',
  },
};

function BindingEditor({ generation }: { generation: number }) {
  const { t } = useTranslation('setting');
  const bindings = useProviderBindingStore((s) => s.bindings);
  const pending = useProviderBindingStore((s) => s.pending);
  const { data, error, isLoading, mutate } = useFetchProviderBindings();
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState<ProviderBinding>();
  const { feedback, setFeedback, checking, check, isCurrent, report } = useBindingFeedback(
    generation,
    t('providerBindings.failed'),
  );
  const patch = (value: Partial<ProviderBindingConfig>) =>
    setDraft((prev) => ({ ...prev, ...value }));
  return (
    <Flexbox gap={16} padding={24}>
      <Text as="h1">{t('providerBindings.title')}</Text>
      <Text>{t('providerBindings.description')}</Text>
      <AsyncBoundary
        data={data}
        empty={<Text>{t('providerBindings.empty')}</Text>}
        error={error}
        isEmpty={bindings.length === 0}
        isLoading={isLoading}
        onRetry={() => void mutate()}
      >
        {bindings.map((binding) => (
          <Flexbox gap={8} key={binding.id}>
            <Text>
              {binding.name} · {binding.provider} / {binding.model}
            </Text>
            <Flexbox horizontal gap={8}>
              <Button
                disabled={!!pending[binding.id]}
                onClick={() => {
                  setEditing(binding);
                  setDraft(
                    providerBindingConfigSchema.parse({
                      name: binding.name,
                      provider: binding.provider,
                      model: binding.model,
                      endpoint: binding.endpoint,
                      secretReference: binding.secretReference,
                      enabled: false,
                      selection: binding.selection,
                    }),
                  );
                }}
              >
                {t('providerBindings.edit')}
              </Button>
              <Button
                disabled={!!pending[binding.id]}
                onClick={() =>
                  confirmModal({
                    title: t('providerBindings.deleteTitle'),
                    content: t('providerBindings.deleteContent', { name: binding.name }),
                    okText: t('providerBindings.delete'),
                    cancelText: t('providerBindings.cancel'),
                    okButtonProps: { danger: true },
                    onOk: () =>
                      report(async () => {
                        await providerBindingActions.remove(binding);
                        if (isCurrent() && editing?.id === binding.id) {
                          setEditing(undefined);
                          setDraft(initial);
                        }
                      }, t('providerBindings.deleted')),
                  })
                }
              >
                {t('providerBindings.delete')}
              </Button>
              <Button
                disabled={!!checking || !!pending[binding.id]}
                onClick={() =>
                  void check(binding.id, binding.revision, t('providerBindings.verified'))
                }
              >
                {t('providerBindings.check')}
              </Button>
            </Flexbox>
          </Flexbox>
        ))}
      </AsyncBoundary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = providerBindingConfigSchema.safeParse(draft);
          if (!parsed.success) {
            setFeedback(t('providerBindings.invalid'));
            return;
          }
          void report(async () => {
            await providerBindingActions.save(parsed.data, editing);
            if (isCurrent()) {
              setEditing(undefined);
              setDraft(initial);
            }
          }, t('providerBindings.saved'));
        }}
      >
        <Flexbox gap={12}>
          {(['name', 'provider', 'model', 'endpoint', 'secretReference'] as const).map((field) => (
            <label key={field}>
              {t(`providerBindings.${field}`)}
              <Input
                required
                autoComplete="off"
                value={draft[field]}
                maxLength={
                  field === 'endpoint'
                    ? 2048
                    : field === 'name'
                      ? 120
                      : field === 'secretReference'
                        ? 216
                        : 200
                }
                onChange={(event) => patch({ [field]: event.target.value })}
              />
            </label>
          ))}
          {(['runtime', 'engine', 'effort', 'mode', 'speed', 'target'] as const).map((field) => (
            <label key={field}>
              {t(`providerBindings.${field}`)}
              <Select
                options={selectionOptions[field].map((value) => ({ label: value, value }))}
                value={draft.selection[field]}
                onChange={(value) => {
                  if (typeof value === 'string' && selectionOptions[field].includes(value))
                    setDraft((prev) => ({
                      ...prev,
                      selection: { ...prev.selection, [field]: value },
                    }));
                }}
              />
            </label>
          ))}
          {draft.selection.target === 'device' && (
            <label>
              {t('providerBindings.deviceId')}
              <Input
                required
                value={draft.selection.deviceId ?? ''}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    selection: { ...prev.selection, deviceId: event.target.value },
                  }))
                }
              />
            </label>
          )}
          <Text>{t('providerBindings.referenceHint')}</Text>
          <Text>{t('providerBindings.configurationOnly')}</Text>
          <Button disabled={!!pending[editing?.id ?? 'create']} htmlType="submit" type="primary">
            {t('providerBindings.save')}
          </Button>
          {editing && (
            <Button
              onClick={() => {
                setEditing(undefined);
                setDraft(initial);
              }}
            >
              {t('providerBindings.cancel')}
            </Button>
          )}
        </Flexbox>
      </form>
      {feedback && <div role="status">{feedback}</div>}
    </Flexbox>
  );
}
export default function ProviderBindings() {
  const generation = useProviderBindingStore((s) => s.generation);
  return <BindingEditor generation={generation} key={generation} />;
}
