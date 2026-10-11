'use client';
import { Markdown } from '@lobehub/ui';
import type { ProjectHealth, ProjectUpdate, ProjectUpdateKind } from '@orvilo/types';
import { cn } from 'cn';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- project-update composer affordance
import { CircleDotIcon, EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { createElement, memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { confirmModal } from '@/components/Modal';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { PROJECT_HEALTH_META, ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { formatProjectDay } from '@/features/Projects/projectPlanningDate';
import { useClientDataSWR } from '@/libs/swr';
import { projectService } from '@/services/project';
import { useCurrentProjectDetail } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import {
  clearProjectUpdateDraft,
  persistProjectUpdateDraft,
  PROJECT_UPDATE_HEALTH_ORDER,
  projectUpdateDraftKey,
  readProjectUpdateDraft,
  resolveProjectUpdateDraft,
} from './projectUpdateDraft';
import { ProjectUpdateEditor } from './ProjectUpdateEditor';

/**
 * Stable class the row's CSS reveals on `:hover`/`:focus-within` — the same
 * hover-only secondary-control pattern the milestone cards use.
 */
const UPDATE_ACTIONS_CLASS = 'project-update-actions';

const styles = {
  collapsed:
    'flex w-full cursor-text items-center gap-2 rounded-(--radius-card) border border-border bg-transparent px-3 py-2 text-start text-sm leading-5.5 text-muted-foreground hover:border-primary-border',
  collapsedEmpty:
    'box-border h-9 min-h-9 min-w-9 w-auto cursor-pointer justify-center rounded-(--radius-button) border-transparent ps-2.5 pe-3 py-0 text-sm leading-5.5 font-medium whitespace-nowrap',
  emptyContainer:
    'box-border flex w-full justify-center rounded-(--radius-card) border border-border p-4',
  composer: 'min-h-43 overflow-hidden rounded-(--radius-card) border-[0.5px] border-border bg-card',
  composerFooter: 'mbs-auto py-3.5 ps-3 pe-3.5',
  healthPick: 'cursor-pointer',
  modeTab:
    'min-h-8 h-8 px-2 py-0 text-sm leading-5.5 transition-[color,background-color,border-color,box-shadow,opacity] duration-(--orvilo-motion-fast)',
  modeTabs: 'w-auto flex-none',
  updateActions: 'opacity-0 transition-opacity duration-(--orvilo-motion-fast)',
  updateRow:
    'border-be border-divider py-2.5 last:border-be-0 [&:hover_.project-update-actions]:opacity-100 [&:focus-within_.project-update-actions]:opacity-100',
  updateRowMenuOpen: '[&_.project-update-actions]:opacity-100',
};

const toUpdate = (row: {
  authorAvatar?: null | string;
  authorId: string;
  authorName?: null | string;
  body: string;
  createdAt: Date | string;
  health?: null | ProjectHealth;
  id: string;
  kind?: null | ProjectUpdateKind;
  projectId: string;
}): ProjectUpdate => ({
  authorAvatar: row.authorAvatar ?? undefined,
  authorId: row.authorId,
  authorName: row.authorName ?? undefined,
  body: row.body,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  health: row.health ?? undefined,
  id: row.id,
  kind: row.kind ?? 'update',
  projectId: row.projectId,
});

export const useProjectUpdates = (projectId?: string) =>
  useClientDataSWR(projectId ? ['project:updates', projectId] : null, async () => {
    const response = await projectService.listUpdates(projectId!);
    return (response?.data ?? []).map(toUpdate);
  });

/** Server capabilities govern deletion; only the author may edit a post. */
export const useCanModerateProjectUpdate = (project?: { id?: string } | null) => {
  const userId = useUserStore(userProfileSelectors.userId);
  const detail = useCurrentProjectDetail(project?.id);
  const canComment = detail?.capabilities?.canComment === true;
  const canManage = detail?.capabilities?.canManage === true;
  return useCallback(
    (update: ProjectUpdate) => ({
      canEdit: canComment && update.authorId === userId,
      canDelete: canComment && (canManage || update.authorId === userId),
    }),
    [canComment, canManage, userId],
  );
};

interface ProjectUpdateComposerProps {
  defaultExpanded?: boolean;
  defaultMode?: ProjectUpdateKind;
  /** When set, the composer edits this row instead of posting a new one. */
  editingUpdate?: ProjectUpdate;
  emptyState?: boolean;
  onCancelEdit?: () => void;
  onExpand?: () => void;
  onPosted?: () => void;
  projectId: string;
}

/**
 * One mount per draft scope: `draftKey` is fixed for the lifetime of this
 * component (the wrapper below remounts it when the scope changes), so its
 * state and draft writes can never land under another scope's key.
 */
const ScopedProjectUpdateComposer = memo<ProjectUpdateComposerProps & { draftKey?: string }>(
  ({
    defaultExpanded,
    defaultMode = 'update',
    draftKey,
    editingUpdate,
    emptyState,
    onCancelEdit,
    onExpand,
    onPosted,
    projectId,
  }) => {
    const { t } = useTranslation(['project', 'common']);
    const canComment = useCurrentProjectDetail(projectId)?.capabilities?.canComment === true;
    const userId = useUserStore(userProfileSelectors.userId);
    const canPost = canComment && (!editingUpdate || editingUpdate.authorId === userId);
    const editing = !!editingUpdate;
    const [initial] = useState(() =>
      resolveProjectUpdateDraft(readProjectUpdateDraft(draftKey), editingUpdate, defaultMode),
    );
    const [body, setBody] = useState(initial.body);
    const [health, setHealth] = useState<ProjectHealth>(initial.health);
    const [posting, setPosting] = useState(false);
    const [editorRevision, setEditorRevision] = useState(0);

    const [expanded, setExpanded] = useState(defaultExpanded || editing);
    // `kind` is immutable once posted — edit mode never switches modes.
    const [mode, setMode] = useState<ProjectUpdateKind>(initial.mode);
    // Set once the edit is saved or cancelled: nothing may be stored afterwards.
    const settled = useRef(false);
    useEffect(() => {
      if (settled.current) return;
      persistProjectUpdateDraft(draftKey, { body, health, mode }, editingUpdate);
    }, [body, draftKey, editingUpdate, health, mode]);
    const settle = () => {
      settled.current = true;
      clearProjectUpdateDraft(draftKey);
    };

    const post = async () => {
      const content = body.trim();
      if (!canPost || !content || posting) return;
      setPosting(true);
      try {
        if (editingUpdate) {
          await projectService.updateUpdate(projectId, editingUpdate.id, {
            body: content,
            health: mode === 'update' ? health : undefined,
          });
          settle();
        } else {
          await projectService.createUpdate(projectId, {
            body: content,
            health: mode === 'update' ? health : undefined,
            kind: mode,
          });
          setBody('');
          setEditorRevision((revision) => revision + 1);
          if (!defaultExpanded) setExpanded(false);
          clearProjectUpdateDraft(draftKey);
        }
        onPosted?.();
      } catch (error) {
        console.error('Failed to save project update', error);
        toast.error(
          editingUpdate
            ? t('overview.updateSaveError')
            : t('overview.updatePostError', { defaultValue: 'Failed to post update' }),
        );
      } finally {
        setPosting(false);
      }
    };

    if (!expanded) {
      const entry = (
        <button
          disabled={!canPost}
          type="button"
          className={[styles.collapsed, emptyState && styles.collapsedEmpty]
            .filter(Boolean)
            .join(' ')}
          onClick={() => (onExpand ? onExpand() : setExpanded(true))}
        >
          <CircleDotIcon className="opacity-50" size={14} />
          <span
            className={cn('text-sm leading-5.5 text-muted-foreground', emptyState && 'font-medium')}
          >
            {emptyState
              ? t('overview.firstUpdate', { defaultValue: 'Write first project update' })
              : t('overview.updatePlaceholder', { defaultValue: 'Write a project update…' })}
          </span>
        </button>
      );

      if (emptyState)
        return (
          <div className={styles.emptyContainer}>
            <div>{entry}</div>
          </div>
        );

      return entry;
    }

    return (
      <div className="flex flex-col gap-3">
        {/* A posted row keeps its kind — edit mode drops the Comment/Update tabs.
          Editing a comment leaves the header empty, so it is skipped entirely. */}
        {(!editing || mode === 'update') && (
          <div className="flex flex-row items-center gap-1 p-2">
            {!editing && (
              <Tabs
                className={styles.modeTabs}
                value={mode}
                onValueChange={(key) => {
                  if (key === 'comment' || key === 'update') setMode(key);
                }}
              >
                <TabsList className="w-full group-data-horizontal/tabs:h-9 rounded-(--radius-button)">
                  {[
                    { key: 'comment', label: t('overview.updateModeComment') },
                    { key: 'update', label: t('overview.updateModeUpdate') },
                  ].map((item) => (
                    <TabsTrigger className={styles.modeTab} key={item.key} value={item.key}>
                      {item.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            {mode === 'update' && (
              <DropdownMenu
                items={PROJECT_UPDATE_HEALTH_ORDER.map((state) => ({
                  key: state,
                  label: t(`overview.health.${state}`),
                  icon: <ProjectHealthIcon health={state} size={12} />,
                  onClick: () => setHealth(state),
                }))}
              >
                <Button size="sm" variant="outline">
                  <ProjectHealthIcon health={health} size={12} />
                  {t(`overview.health.${health}`, { defaultValue: health })}
                </Button>
              </DropdownMenu>
            )}
          </div>
        )}
        <div className={cn('flex flex-col', styles.composer)}>
          <ProjectUpdateEditor
            disabled={!canPost || posting}
            initialContent={editorRevision === 0 ? initial.body : ''}
            key={editorRevision}
            label={t(mode === 'update' ? 'overview.updateEditor' : 'overview.commentEditor')}
            placeholder={t(
              mode === 'update' ? 'overview.updatePlaceholder' : 'overview.commentPlaceholder',
            )}
            onChange={setBody}
            onSubmit={() => void post()}
          />
          <div
            className={cn(
              cn('flex flex-row', styles.composerFooter),
              'items-center justify-end gap-2',
            )}
          >
            {editing && (
              <Button
                disabled={posting}
                size="lg"
                variant="outline"
                onClick={() => {
                  settle();
                  onCancelEdit?.();
                }}
              >
                {t('common:cancel')}
              </Button>
            )}
            <Button
              aria-busy={posting}
              disabled={!canPost || !body.trim() || posting}
              size="lg"
              variant="default"
              onClick={() => void post()}
            >
              {posting && <Spinner />}
              {editing
                ? t('common:save')
                : t(mode === 'update' ? 'overview.postUpdate' : 'overview.postComment')}
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

ScopedProjectUpdateComposer.displayName = 'ScopedProjectUpdateComposer';

export const ProjectUpdateComposer = memo<ProjectUpdateComposerProps>((props) => {
  const userId = useUserStore(userProfileSelectors.userId);
  const workspaceId = useActiveWorkspaceId();
  const { editingUpdate, projectId } = props;
  const draftKey = projectUpdateDraftKey({
    projectId,
    updateId: editingUpdate?.id,
    userId,
    workspaceId,
  });

  // Signed out there is no draft key, yet a project or row change still remounts.
  return (
    <ScopedProjectUpdateComposer
      {...props}
      draftKey={draftKey}
      key={draftKey ?? `${projectId}:${editingUpdate?.id ?? 'new'}`}
    />
  );
});

ProjectUpdateComposer.displayName = 'ProjectUpdateComposer';

export const ProjectUpdateRow = memo<{
  /** Whether the ⋯ menu (edit/delete) renders — the caller applies the row ACL. */
  canEdit?: boolean;
  canDelete?: boolean;
  /** The host already draws the author's avatar as the row's leading mark (activity timeline). */
  hideAuthorAvatar?: boolean;
  /** Called after a delete lands so the feed can revalidate. */
  onChanged?: () => void;
  onEdit?: (update: ProjectUpdate) => void;
  update: ProjectUpdate;
}>(({ update, canEdit, canDelete, hideAuthorAvatar, onChanged, onEdit }) => {
  const { t } = useTranslation(['project', 'common']);
  const meta = update.health ? PROJECT_HEALTH_META[update.health] : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const confirmDelete = () =>
    confirmModal({
      content: t(
        update.kind === 'comment'
          ? 'overview.commentDeleteConfirm.content'
          : 'overview.updateDeleteConfirm.content',
      ),
      okButtonProps: { danger: true },
      okText: t('common:delete'),
      title: t(
        update.kind === 'comment'
          ? 'overview.commentDeleteConfirm.title'
          : 'overview.updateDeleteConfirm.title',
      ),
      onOk: async () => {
        try {
          await projectService.deleteUpdate(update.projectId, update.id);
          onChanged?.();
        } catch (error) {
          console.error('Failed to delete project update', error);
          toast.error(t('overview.updateDeleteError'));
        }
      },
    });
  return (
    <div
      className={cn(
        cn('flex flex-row', cn(styles.updateRow, menuOpen && styles.updateRowMenuOpen)),
        'items-start gap-3',
      )}
    >
      {hideAuthorAvatar ? null : (
        <Avatar avatar={update.authorAvatar} name={update.authorName} size={24} />
      )}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex flex-row items-center gap-2">
          <span className="text-sm leading-5.5 font-medium">
            {update.authorName || t('overview.updateAnonymous', { defaultValue: 'Member' })}
          </span>
          {meta && update.health && (
            <Badge
              className="h-auto leading-5"
              radius="full"
              size="default"
              variant={
                meta.tag === 'error'
                  ? 'destructive-light'
                  : meta.tag === 'warning'
                    ? 'warning-light'
                    : 'success-light'
              }
            >
              <ProjectHealthIcon health={update.health} size={12} />
              {t(`overview.health.${update.health}`, { defaultValue: update.health })}
            </Badge>
          )}
          <span className="text-muted-foreground text-xs leading-5">
            {formatProjectDay(update.createdAt)}
          </span>
          {(canEdit || canDelete) && (
            <div
              className={cn(
                cn('flex flex-row', cn(UPDATE_ACTIONS_CLASS, styles.updateActions)),
                'justify-end flex-1',
              )}
            >
              <DropdownMenu
                items={[
                  ...(canEdit
                    ? [
                        {
                          icon: PencilIcon,
                          key: 'edit',
                          label: t('common:edit'),
                          onClick: () => onEdit?.(update),
                        },
                      ]
                    : []),
                  ...(canEdit && canDelete ? [{ type: 'divider' as const }] : []),
                  ...(canDelete
                    ? [
                        {
                          danger: true,
                          icon: Trash2Icon,
                          key: 'delete',
                          label: t('common:delete'),
                          onClick: confirmDelete,
                        },
                      ]
                    : []),
                ]}
                onOpenChange={setMenuOpen}
              >
                <Button aria-label={t('overview.updateMenu')} size="icon-sm" variant="ghost">
                  {createElement(EllipsisIcon, { 'size': 16, 'aria-hidden': true })}
                </Button>
              </DropdownMenu>
            </div>
          )}
        </div>
        <Markdown fontSize={14} lineHeight={22 / 14}>
          {update.body}
        </Markdown>
      </div>
    </div>
  );
});

ProjectUpdateRow.displayName = 'ProjectUpdateRow';
