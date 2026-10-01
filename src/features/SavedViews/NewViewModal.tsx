'use client';

import {
  normalizeWorkQuerySubGroupBy,
  type WorkQuery,
  type WorkQueryEntityType,
  type WorkQueryFilter,
} from '@orvilo/types';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { Modal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { mutate } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { workQueryWithViewerTimeZone } from './savedViewDisplay';
import ViewDefinitionEditor, { type ViewEditorState } from './ViewDefinitionEditor';
import { builderToFilter, filterToBuilder } from './workQueryBuilder';

interface NewViewModalProps {
  defaultEntityType?: WorkQueryEntityType;
  /**
   * When opened from a team surface the share row starts scoped to that team —
   * the visitor can still widen to workspace/private before saving.
   */
  defaultTeamId?: string;
  onClose: () => void;
  open: boolean;
  /**
   * Pre-populates the filter builder — the surface's applied filters (and
   * scope) arrive as editable rows so the saved view reproduces what the list
   * was showing. Non-renderable nodes survive as preserved slots.
   */
  seedFilter?: WorkQueryFilter;
}

const draftQuery = (state: ViewEditorState): WorkQuery => ({
  entityType: state.entityType,
  filter: builderToFilter(state.entityType, state.builder),
  groupBy: state.groupBy === 'none' ? undefined : state.groupBy,
  layout: state.layout,
  schemaVersion: 1,
  sort: state.sort,
  sortMode: state.layout === 'board' ? state.sortMode : undefined,
  subGroupBy:
    state.entityType === 'task' && state.groupBy !== 'none'
      ? normalizeWorkQuerySubGroupBy(state.groupBy, state.subGroupBy)
      : undefined,
});

/**
 * Linear's New View flow: pick entity → filters render a live result count →
 * name + share → save lands on the new view. Nothing is persisted before the
 * explicit save (cancel leaves no draft behind).
 */
const NewViewModal = memo<NewViewModalProps>((props) => {
  const { defaultEntityType = 'task', defaultTeamId, onClose, open, seedFilter } = props;
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const seedBuilder = useCallback(
    () => filterToBuilder(defaultEntityType, seedFilter),
    [defaultEntityType, seedFilter],
  );
  const [state, setState] = useState<ViewEditorState>(() => ({
    builder: seedBuilder(),
    entityType: defaultEntityType,
    groupBy: 'none',
    layout: 'list',
    name: '',
    teamId: defaultTeamId ?? null,
    visibility: defaultTeamId ? 'team' : 'private',
  }));
  const [preview, setPreview] = useState<{ titles: string[]; total: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setState({
        builder: seedBuilder(),
        entityType: defaultEntityType,
        groupBy: 'none',
        layout: 'list',
        name: '',
        teamId: defaultTeamId ?? null,
        visibility: defaultTeamId ? 'team' : 'private',
      });
      setPreview(null);
    }
  }, [defaultEntityType, defaultTeamId, open, seedBuilder]);

  const query = useMemo(() => draftQuery(state), [state]);
  const viewerTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    [],
  );
  const previewQuery = useMemo(
    () => workQueryWithViewerTimeZone(query, viewerTimeZone),
    [query, viewerTimeZone],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void workAttentionService
        .query({ limit: 5, query: previewQuery })
        .then((result) => {
          const data = result?.data;
          if (!data) {
            setPreview(null);
            return;
          }
          const items = 'tasks' in data ? (data.tasks ?? []) : (data.projects ?? []);
          setPreview({
            titles: items.slice(0, 5).map((item) => {
              const label = 'title' in item ? item.title : 'name' in item ? item.name : null;
              return typeof label === 'string' ? label : '';
            }),
            total: data.total ?? items.length,
          });
        })
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [open, previewQuery]);

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
      open={open}
      title={t('savedViews.newView')}
      width={640}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button disabled={!ready} loading={saving} variant="default" onClick={() => void save()}>
            {t('savedViews.createView')}
          </Button>
        </div>
      }
      onCancel={onClose}
    >
      <div className="flex flex-col gap-4 py-2">
        <ViewDefinitionEditor
          showEntityPicker
          showName
          showShare
          value={state}
          onChange={setState}
        />
        <div
          className="flex flex-col gap-1 p-3"
          style={{
            background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))',
            borderRadius: 8,
          }}
        >
          <div className="text-[12px] text-muted-foreground">
            {preview
              ? t('savedViews.previewCount', { count: preview.total })
              : t('savedViews.previewPending')}
          </div>
          {preview?.titles.map((title) => (
            <div className="truncate block text-[12px]" key={title}>
              · {title}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
});

NewViewModal.displayName = 'NewViewModal';

export default NewViewModal;
