'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Modal, Text, toast } from '@lobehub/ui/base-ui';
import type { WorkQuery } from '@orvilo/types';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { mutate } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import ViewDefinitionEditor, { type ViewEditorState } from './ViewDefinitionEditor';
import { builderToFilter } from './workQueryBuilder';

interface NewViewModalProps {
  onClose: () => void;
  open: boolean;
}

const draftQuery = (state: ViewEditorState): WorkQuery => ({
  entityType: state.entityType,
  filter: builderToFilter(state.entityType, state.builder),
  groupBy: state.groupBy === 'none' ? undefined : state.groupBy,
  layout: state.layout,
  schemaVersion: 1,
  sort: state.sort,
});

/**
 * Linear's New View flow: pick entity → filters render a live result count →
 * name + share → save lands on the new view. Nothing is persisted before the
 * explicit save (cancel leaves no draft behind).
 */
const NewViewModal = memo<NewViewModalProps>(({ onClose, open }) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const [state, setState] = useState<ViewEditorState>({
    builder: { retained: [], rows: [] },
    entityType: 'task',
    groupBy: 'none',
    layout: 'list',
    name: '',
    teamId: null,
    visibility: 'private',
  });
  const [preview, setPreview] = useState<{ titles: string[]; total: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setState({
        builder: { retained: [], rows: [] },
        entityType: 'task',
        groupBy: 'none',
        layout: 'list',
        name: '',
        teamId: null,
        visibility: 'private',
      });
      setPreview(null);
    }
  }, [open]);

  const query = useMemo(() => draftQuery(state), [state]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void workAttentionService
        .query({ limit: 5, query })
        .then((result) => {
          const data = result?.data;
          if (!data) {
            setPreview(null);
            return;
          }
          const items = 'tasks' in data ? (data.tasks ?? []) : (data.projects ?? []);
          setPreview({
            titles: items
              .slice(0, 5)
              .map((item) => ('title' in item ? item.title : item.name) ?? ''),
            total: data.total ?? items.length,
          });
        })
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [open, query]);

  const ready =
    state.name.trim().length > 0 && (state.visibility !== 'team' || Boolean(state.teamId));

  const save = useCallback(async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: state.entityType,
        layout: state.layout,
        name: state.name.trim(),
        query,
        teamId: state.visibility === 'team' ? state.teamId : null,
        visibility: state.visibility,
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      onClose();
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('savedViews.saveAsFailed'));
    } finally {
      setSaving(false);
    }
  }, [navigate, onClose, query, ready, saving, state, t, workspaceId]);

  return (
    <Modal
      destroyOnHidden
      open={open}
      title={t('savedViews.newView')}
      width={640}
      footer={
        <Flexbox horizontal gap={8} justify="flex-end">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button disabled={!ready} loading={saving} type="primary" onClick={() => void save()}>
            {t('savedViews.createView')}
          </Button>
        </Flexbox>
      }
      onCancel={onClose}
    >
      <Flexbox gap={16} paddingBlock={8}>
        <ViewDefinitionEditor
          showEntityPicker
          showName
          showShare
          value={state}
          onChange={setState}
        />
        <Flexbox
          gap={4}
          padding={12}
          style={{
            background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))',
            borderRadius: 8,
          }}
        >
          <Text fontSize={12} type="secondary">
            {preview
              ? t('savedViews.previewCount', { count: preview.total })
              : t('savedViews.previewPending')}
          </Text>
          {preview?.titles.map((title) => (
            <Text ellipsis fontSize={12} key={title}>
              · {title}
            </Text>
          ))}
        </Flexbox>
      </Flexbox>
    </Modal>
  );
});

NewViewModal.displayName = 'NewViewModal';

export default NewViewModal;
