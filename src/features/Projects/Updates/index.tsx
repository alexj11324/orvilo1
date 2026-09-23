'use client';

import { Flexbox, Icon, Markdown } from '@lobehub/ui';
import { Button, confirmModal, DropdownMenu, Tabs, Tag, Text, toast } from '@lobehub/ui/base-ui';
import type { ProjectHealth, ProjectUpdate, ProjectUpdateKind } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import { CircleDotIcon, EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import Avatar from '@/components/Avatar';
import { PROJECT_HEALTH_META, ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { useClientDataSWR } from '@/libs/swr';
import { projectService } from '@/services/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { ProjectUpdateEditor } from './ProjectUpdateEditor';

/**
 * Stable class the row's CSS reveals on `:hover`/`:focus-within` — the same
 * hover-only secondary-control pattern the milestone cards use.
 */
const UPDATE_ACTIONS_CLASS = 'project-update-actions';

const styles = createStaticStyles(({ css }) => ({
  collapsed: css`
    cursor: text;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    padding-block: 8px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 8px;

    color: ${cssVar.colorTextSecondary};
    text-align: start;

    background: transparent;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
    }
  `,
  collapsedEmpty: css`
    cursor: pointer;

    justify-content: center;

    box-sizing: border-box;
    width: auto;
    min-width: 32px;
    height: 32px;
    min-height: 32px;
    padding-block: 0;
    padding-inline: 10px 12px;
    border-color: transparent;
    border-radius: 9999px;

    font-size: 13px;
    font-weight: 500;
    line-height: normal;
    white-space: nowrap;
  `,
  emptyContainer: css`
    display: flex;
    justify-content: center;

    box-sizing: border-box;
    width: 100%;
    padding: 16px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 10px;
  `,
  composer: css`
    overflow: hidden;

    min-height: 172px;
    border: 0.5px solid ${cssVar.colorBorder};
    border-radius: 10px;

    background: ${cssVar.colorBgContainer};
  `,
  composerFooter: css`
    margin-block-start: auto;
    padding-block: 14px;
    padding-inline: 12px 14px;
  `,
  healthPick: css`
    cursor: pointer;
  `,
  modeTab: css`
    height: 24px;
    min-height: 24px;
    padding-block: 0;
    padding-inline: 8px;

    font-size: 12px;
  `,
  modeTabs: css`
    flex: none;
    width: auto;
  `,
  updateActions: css`
    opacity: 0;
    transition: opacity 120ms;
  `,
  updateRow: css`
    padding-block: 10px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }

    /* Linear parity: the row's ⋯ menu is a secondary control that appears on
       hover/focus, like the milestone cards' hover-only controls. */
    &:hover .${UPDATE_ACTIONS_CLASS}, &:focus-within .${UPDATE_ACTIONS_CLASS} {
      opacity: 1;
    }
  `,
  updateRowMenuOpen: css`
    .${UPDATE_ACTIONS_CLASS} {
      opacity: 1;
    }
  `,
}));

const PROJECT_UPDATE_HEALTH_ORDER: ProjectHealth[] = ['onTrack', 'atRisk', 'offTrack'];

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

/**
 * Per-row ⋯-menu gate: the author may always edit/delete their own post; the
 * project owner, the project lead, or a workspace admin may moderate
 * anyone's — the same ACL `ProjectModel.updateUpdate`/`deleteUpdate` enforce.
 * Accepts a possibly-unloaded project so surfaces can call it above their
 * loading early-returns.
 */
export const useCanModerateProjectUpdate = (
  project?: { leadUserId?: null | string; userId?: null | string } | null,
) => {
  const userId = useUserStore(userProfileSelectors.userId);
  const { canManageMembers } = useWorkspaceCapabilities();
  const canManage =
    canManageMembers ||
    (!!userId && (project?.userId === userId || project?.leadUserId === userId));
  return useCallback(
    (update: ProjectUpdate) => canManage || (!!userId && update.authorId === userId),
    [canManage, userId],
  );
};

export const ProjectUpdateComposer = memo<{
  defaultExpanded?: boolean;
  defaultMode?: ProjectUpdateKind;
  /** When set, the composer edits this row instead of posting a new one. */
  editingUpdate?: ProjectUpdate;
  emptyState?: boolean;
  onCancelEdit?: () => void;
  onExpand?: () => void;
  onPosted?: () => void;
  projectId: string;
}>(
  ({
    defaultExpanded,
    defaultMode = 'update',
    editingUpdate,
    emptyState,
    onCancelEdit,
    onExpand,
    onPosted,
    projectId,
  }) => {
    const { t } = useTranslation(['project', 'common']);
    const editing = !!editingUpdate;
    const [body, setBody] = useState(editingUpdate?.body ?? '');
    const [health, setHealth] = useState<ProjectHealth>(editingUpdate?.health ?? 'onTrack');
    const [posting, setPosting] = useState(false);
    const [editorRevision, setEditorRevision] = useState(0);

    const [expanded, setExpanded] = useState(defaultExpanded || editing);
    // `kind` is immutable once posted — edit mode never switches modes.
    const [mode, setMode] = useState<ProjectUpdateKind>(editingUpdate?.kind ?? defaultMode);

    const post = async () => {
      const content = body.trim();
      if (!content || posting) return;
      setPosting(true);
      try {
        if (editingUpdate) {
          await projectService.updateUpdate(projectId, editingUpdate.id, {
            body: content,
            health: mode === 'update' ? health : undefined,
          });
        } else {
          await projectService.createUpdate(projectId, {
            body: content,
            health: mode === 'update' ? health : undefined,
            kind: mode,
          });
          setBody('');
          setEditorRevision((revision) => revision + 1);
          if (!defaultExpanded) setExpanded(false);
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
          type="button"
          className={[styles.collapsed, emptyState && styles.collapsedEmpty]
            .filter(Boolean)
            .join(' ')}
          onClick={() => (onExpand ? onExpand() : setExpanded(true))}
        >
          <Icon icon={CircleDotIcon} size={14} style={{ opacity: 0.5 }} />
          <Text fontSize={13} type={'secondary'} weight={emptyState ? 500 : undefined}>
            {emptyState
              ? t('overview.firstUpdate', { defaultValue: 'Write first project update' })
              : t('overview.updatePlaceholder', { defaultValue: 'Write a project update…' })}
          </Text>
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
      <Flexbox className={styles.composer}>
        {/* A posted row keeps its kind — edit mode drops the Comment/Update tabs.
          Editing a comment leaves the header empty, so it is skipped entirely. */}
        {(!editing || mode === 'update') && (
          <Flexbox horizontal align={'center'} gap={4} padding={8}>
            {!editing && (
              <Tabs
                activeKey={mode}
                className={styles.modeTabs}
                classNames={{ tab: styles.modeTab }}
                size="small"
                items={[
                  { key: 'comment', label: t('overview.updateModeComment') },
                  { key: 'update', label: t('overview.updateModeUpdate') },
                ]}
                onChange={(key) => {
                  if (key === 'comment' || key === 'update') setMode(key);
                }}
              />
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
                <Button
                  className={styles.modeTab}
                  icon={<ProjectHealthIcon health={health} size={12} />}
                  size={'small'}
                >
                  {t(`overview.health.${health}`, { defaultValue: health })}
                </Button>
              </DropdownMenu>
            )}
          </Flexbox>
        )}
        <ProjectUpdateEditor
          disabled={posting}
          initialContent={editingUpdate?.body}
          key={editorRevision}
          label={t(mode === 'update' ? 'overview.updateEditor' : 'overview.commentEditor')}
          placeholder={t(
            mode === 'update' ? 'overview.updatePlaceholder' : 'overview.commentPlaceholder',
          )}
          onChange={setBody}
          onSubmit={() => void post()}
        />
        <Flexbox
          horizontal
          align={'center'}
          className={styles.composerFooter}
          gap={8}
          justify={'flex-end'}
        >
          {editing && (
            <Button className={styles.modeTab} disabled={posting} onClick={onCancelEdit}>
              {t('common:cancel')}
            </Button>
          )}
          <Button
            className={styles.modeTab}
            disabled={!body.trim()}
            loading={posting}
            type={'primary'}
            onClick={() => void post()}
          >
            {editing
              ? t('common:save')
              : t(mode === 'update' ? 'overview.postUpdate' : 'overview.postComment')}
          </Button>
        </Flexbox>
      </Flexbox>
    );
  },
);

ProjectUpdateComposer.displayName = 'ProjectUpdateComposer';

export const ProjectUpdateRow = memo<{
  /** Whether the ⋯ menu (edit/delete) renders — the caller applies the row ACL. */
  canEdit?: boolean;
  /** Called after a delete lands so the feed can revalidate. */
  onChanged?: () => void;
  onEdit?: (update: ProjectUpdate) => void;
  update: ProjectUpdate;
}>(({ update, canEdit, onChanged, onEdit }) => {
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
    <Flexbox
      horizontal
      align={'flex-start'}
      className={cx(styles.updateRow, menuOpen && styles.updateRowMenuOpen)}
      gap={10}
    >
      <Avatar avatar={update.authorAvatar} name={update.authorName} size={24} />
      <Flexbox gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Flexbox horizontal align={'center'} gap={8}>
          <Text fontSize={13} weight={500}>
            {update.authorName || t('overview.updateAnonymous', { defaultValue: 'Member' })}
          </Text>
          {meta && update.health && (
            <Tag
              color={meta.tag}
              icon={<ProjectHealthIcon health={update.health} size={12} />}
              shape={'round'}
              size={'small'}
            >
              {t(`overview.health.${update.health}`, { defaultValue: update.health })}
            </Tag>
          )}
          <Text fontSize={12} type={'secondary'}>
            {dayjs(update.createdAt).format('MMM D')}
          </Text>
          {canEdit && (
            <Flexbox
              horizontal
              className={cx(UPDATE_ACTIONS_CLASS, styles.updateActions)}
              flex={1}
              justify={'flex-end'}
            >
              <DropdownMenu
                items={[
                  {
                    icon: PencilIcon,
                    key: 'edit',
                    label: t('common:edit'),
                    onClick: () => onEdit?.(update),
                  },
                  { type: 'divider' as const },
                  {
                    danger: true,
                    icon: Trash2Icon,
                    key: 'delete',
                    label: t('common:delete'),
                    onClick: confirmDelete,
                  },
                ]}
                onOpenChange={setMenuOpen}
              >
                <Button
                  aria-label={t('overview.updateMenu')}
                  icon={EllipsisIcon}
                  size="small"
                  type="text"
                />
              </DropdownMenu>
            </Flexbox>
          )}
        </Flexbox>
        <Markdown fontSize={15}>{update.body}</Markdown>
      </Flexbox>
    </Flexbox>
  );
});

ProjectUpdateRow.displayName = 'ProjectUpdateRow';
