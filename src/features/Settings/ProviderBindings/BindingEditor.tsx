import { Flexbox, FormItem, Icon, Input, InputPassword } from '@lobehub/ui';
import { Button, Select, Text } from '@lobehub/ui/base-ui';
import type { ProviderBindingConfig } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDown } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import type { ProviderCardMeta } from './useProviderCatalog';

const styles = createStaticStyles(({ css, cssVar }) => ({
  row: css`
    padding-block: 16px;
  `,
  link: css`
    cursor: pointer;
    color: ${cssVar.colorLink};

    &:hover {
      color: ${cssVar.colorLinkHover};
    }
  `,
  advanced: css`
    cursor: pointer;
    user-select: none;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
}));

type SelectionKey = 'effort' | 'engine' | 'mode' | 'runtime' | 'speed' | 'target';

const selectionFields: SelectionKey[] = ['runtime', 'engine', 'effort', 'mode', 'speed', 'target'];

const selectionOptions: Record<SelectionKey, string[]> = {
  runtime: ['orvilo', 'claude-code', 'codex'],
  engine: ['claude-sdk', 'codex-app-server'],
  effort: ['default', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  mode: ['default', 'low', 'medium', 'high', 'ultra'],
  speed: ['default', 'fast'],
  target: ['local', 'device', 'sandbox'],
};

interface BindingEditorProps {
  card: ProviderCardMeta;
  draft: ProviderBindingConfig;
  onCancel: () => void;
  onChange: (next: ProviderBindingConfig) => void;
  onSave: () => void;
  pending?: boolean;
}

export const BindingEditor = memo<BindingEditorProps>(
  ({ card, draft, onCancel, onChange, onSave, pending }) => {
    const { t } = useTranslation('setting');
    const navigate = useWorkspaceAwareNavigate();
    const [showAdvanced, setShowAdvanced] = useState(false);

    const patchSelection = (field: SelectionKey, value: string) => {
      if (!selectionOptions[field].includes(value)) return;
      onChange({ ...draft, selection: { ...draft.selection, [field]: value } });
    };

    return (
      <>
        <FormItem label={t('providerBindings.name')} layout={'horizontal'}>
          <Input
            autoComplete={'off'}
            maxLength={120}
            placeholder={t('providerBindings.namePlaceholder')}
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </FormItem>
        <FormItem
          label={t('providerBindings.secretReference')}
          layout={'horizontal'}
          desc={
            <Flexbox horizontal gap={4}>
              <span>{t('providerBindings.referenceHint')}</span>
              <span
                className={styles.link}
                onClick={() => navigate('/settings/credential', { escape: true })}
              >
                {t('providerBindings.manageCredentials')}
              </span>
            </Flexbox>
          }
        >
          <InputPassword
            autoComplete={'new-password'}
            maxLength={216}
            placeholder={t('providerBindings.secretPlaceholder')}
            value={draft.secretReference}
            onChange={(event) => onChange({ ...draft, secretReference: event.target.value })}
          />
        </FormItem>
        <FormItem
          label={t('providerBindings.endpoint')}
          layout={'horizontal'}
          desc={
            card.apiKeyUrl && (
              <a className={styles.link} href={card.apiKeyUrl} rel={'noreferrer'} target={'_blank'}>
                {t('providerBindings.getApiKey', { name: card.name })}
              </a>
            )
          }
        >
          <Input
            autoComplete={'off'}
            maxLength={2048}
            placeholder={card.endpointPlaceholder ?? 'https://'}
            value={draft.endpoint}
            onChange={(event) => onChange({ ...draft, endpoint: event.target.value })}
          />
        </FormItem>
        <FormItem label={t('providerBindings.model')} layout={'horizontal'}>
          <Input
            autoComplete={'off'}
            maxLength={200}
            placeholder={card.checkModel}
            value={draft.model}
            onChange={(event) => onChange({ ...draft, model: event.target.value })}
          />
        </FormItem>
        <div className={styles.row}>
          <Flexbox
            horizontal
            align={'center'}
            className={styles.advanced}
            gap={4}
            onClick={() => setShowAdvanced((value) => !value)}
          >
            <Text type={'secondary'}>{t('providerBindings.advanced')}</Text>
            <Icon
              color={cssVar.colorTextSecondary}
              icon={ChevronDown}
              size={14}
              style={{ rotate: showAdvanced ? undefined : '-90deg' }}
            />
          </Flexbox>
        </div>
        {showAdvanced &&
          selectionFields.map((field) => (
            <FormItem key={field} label={t(`providerBindings.${field}`)} layout={'horizontal'}>
              <Select
                options={selectionOptions[field].map((value) => ({ label: value, value }))}
                value={draft.selection[field]}
                onChange={(value) => {
                  if (typeof value === 'string') patchSelection(field, value);
                }}
              />
            </FormItem>
          ))}
        {showAdvanced && draft.selection.target === 'device' && (
          <FormItem label={t('providerBindings.deviceId')} layout={'horizontal'}>
            <Input
              autoComplete={'off'}
              value={draft.selection.deviceId ?? ''}
              onChange={(event) =>
                onChange({
                  ...draft,
                  selection: { ...draft.selection, deviceId: event.target.value },
                })
              }
            />
          </FormItem>
        )}
        <div className={styles.row}>
          <Flexbox gap={4}>
            <Text type={'secondary'}>{t('providerBindings.configurationOnly')}</Text>
            <Flexbox horizontal gap={8} justify={'flex-end'}>
              <Button onClick={onCancel}>{t('providerBindings.cancel')}</Button>
              <Button loading={pending} type={'primary'} onClick={onSave}>
                {t('providerBindings.save')}
              </Button>
            </Flexbox>
          </Flexbox>
        </div>
      </>
    );
  },
);
