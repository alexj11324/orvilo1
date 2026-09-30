import { Center, Flexbox, FormGroup, stopPropagation, Tooltip } from '@lobehub/ui';
import { Alert, Button, confirmModal, Switch, Tag, Text } from '@lobehub/ui/base-ui';
import {
  type ProviderBinding,
  type ProviderBindingConfig,
  providerBindingConfigSchema,
} from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { PlusIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { ProviderCombine, ProviderIcon } from '@/components/OrviloIcons';
import { providerBindingActions, useProviderBindingStore } from '@/store/providerBinding';

import { BindingEditor } from './BindingEditor';
import { BindingRow } from './BindingRow';
import { useBindingFeedback } from './useBindingFeedback';
import type { ProviderCardMeta } from './useProviderCatalog';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    &.ant-collapse .ant-collapse-title {
      flex: 1 !important;
      min-width: 0;
    }

    &.ant-collapse .ant-collapse-content-box {
      padding-block-start: 0 !important;
    }
  `,
  desc: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  header: css`
    min-width: 0;
  `,
  row: css`
    padding-block: 16px;
  `,
  help: css`
    border-radius: 50%;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextDescription};

    background: ${cssVar.colorFillTertiary};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFill};
    }
  `,
}));

const draftFor = (card: ProviderCardMeta, binding?: ProviderBinding): ProviderBindingConfig => {
  if (binding)
    return providerBindingConfigSchema.parse({
      name: binding.name,
      provider: binding.provider,
      model: binding.model,
      endpoint: binding.endpoint,
      secretReference: binding.secretReference,
      enabled: false,
      selection: binding.selection,
    });
  return {
    name: card.name,
    provider: card.id,
    model: card.checkModel ?? '',
    endpoint: card.endpointPlaceholder ?? '',
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
};

interface EditorState {
  draft: ProviderBindingConfig;
  editing?: ProviderBinding;
}

interface ProviderCardProps {
  card: ProviderCardMeta;
  generation: number;
}

export const ProviderCard = memo<ProviderCardProps>(({ card, generation }) => {
  const { t } = useTranslation('setting');
  const bindings = useProviderBindingStore(
    useShallow((s) => s.bindings.filter((b) => b.provider === card.id)),
  );
  const pending = useProviderBindingStore((s) => s.pending);
  const { feedback, setFeedback, checking, check, isCurrent, report } = useBindingFeedback(
    generation,
    t('providerBindings.failed'),
  );
  const [expanded, setExpanded] = useState(bindings.length > 0);
  const [editor, setEditor] = useState<EditorState>(() => ({ draft: draftFor(card) }));
  const [editorOpen, setEditorOpen] = useState(false);

  const hasBindings = bindings.length > 0;
  const busy = bindings.some((binding) => pending[binding.id]);
  const showEditor = editorOpen || !hasBindings;

  const openEditor = (binding?: ProviderBinding) => {
    setEditor({ draft: draftFor(card, binding), editing: binding });
    setEditorOpen(true);
    setExpanded(true);
  };
  const closeEditor = () => {
    setEditor({ draft: draftFor(card) });
    setEditorOpen(false);
  };

  const save = async () => {
    const parsed = providerBindingConfigSchema.safeParse(editor.draft);
    if (!parsed.success) {
      setFeedback(t('providerBindings.invalid'));
      return;
    }
    const ok = await report(
      async () => providerBindingActions.save(parsed.data, editor.editing),
      t('providerBindings.saved'),
    );
    if (ok && isCurrent()) closeEditor();
  };

  const remove = (binding: ProviderBinding) =>
    confirmModal({
      title: t('providerBindings.deleteTitle'),
      content: t('providerBindings.deleteContent', { name: binding.name }),
      okText: t('providerBindings.delete'),
      cancelText: t('providerBindings.cancel'),
      okButtonProps: { danger: true },
      onOk: () =>
        report(async () => {
          await providerBindingActions.remove(binding);
          if (isCurrent() && editor.editing?.id === binding.id) closeEditor();
        }, t('providerBindings.deleted')),
    });

  const removeAll = () =>
    confirmModal({
      title: t('providerBindings.disableTitle', { name: card.name }),
      content: t('providerBindings.disableContent', { name: card.name, count: bindings.length }),
      okText: t('providerBindings.delete'),
      cancelText: t('providerBindings.cancel'),
      okButtonProps: { danger: true },
      onOk: () =>
        report(async () => {
          await Promise.all(bindings.map((binding) => providerBindingActions.remove(binding)));
          if (isCurrent()) closeEditor();
        }, t('providerBindings.deleted')),
    });

  const title = card.synthetic ? (
    <Flexbox horizontal align={'center'} gap={8}>
      <ProviderIcon provider={card.id} size={24} style={{ borderRadius: 6 }} type={'avatar'} />
      <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{card.name}</Text>
    </Flexbox>
  ) : (
    <ProviderCombine
      provider={card.id}
      size={24}
      style={{ color: cssVar.colorText }}
      title={card.name}
    />
  );

  const extra = (
    <Flexbox horizontal align={'center'} gap={8} onClick={stopPropagation}>
      {card.url && (
        <Tooltip title={card.url}>
          <a href={card.url} rel={'noreferrer'} target={'_blank'}>
            <Center className={styles.help} height={20} width={20}>
              ?
            </Center>
          </a>
        </Tooltip>
      )}
      {hasBindings && <Tag>{bindings.length}</Tag>}
      <Switch
        checked={hasBindings}
        disabled={busy}
        size={'small'}
        onChange={(checked) => {
          if (checked) {
            setExpanded(true);
          } else if (hasBindings) {
            removeAll();
          }
        }}
      />
    </Flexbox>
  );

  return (
    <FormGroup
      collapsible
      active={expanded}
      className={styles.card}
      classNames={{ desc: styles.desc, header: styles.header }}
      desc={card.description}
      extra={extra}
      title={title}
      variant={'filled'}
      onCollapse={setExpanded}
    >
      {bindings.map((binding) => (
        <BindingRow
          binding={binding}
          checking={checking === binding.id}
          disabled={!!pending[binding.id]}
          key={binding.id}
          onCheck={(row) => void check(row.id, row.revision, t('providerBindings.verified'))}
          onDelete={remove}
          onEdit={openEditor}
        />
      ))}
      {hasBindings && !editorOpen && (
        <div className={styles.row}>
          <Button block icon={PlusIcon} type={'dashed'} onClick={() => openEditor()}>
            {t('providerBindings.addBinding')}
          </Button>
        </div>
      )}
      {showEditor && (
        <>
          {editorOpen && hasBindings && (
            <div className={styles.row}>
              <Text strong type={'secondary'}>
                {editor.editing
                  ? t('providerBindings.editingBinding', { name: editor.editing.name })
                  : t('providerBindings.newBinding')}
              </Text>
            </div>
          )}
          <BindingEditor
            card={card}
            draft={editor.draft}
            pending={!!pending[editor.editing?.id ?? 'create']}
            onCancel={closeEditor}
            onChange={(draft) => setEditor((prev) => ({ ...prev, draft }))}
            onSave={() => void save()}
          />
        </>
      )}
      {feedback && (
        <div className={styles.row}>
          <Alert showIcon title={feedback.message} type={feedback.tone} />
        </div>
      )}
    </FormGroup>
  );
});
