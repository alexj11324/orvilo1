'use client';

import { type AgentLabelListItem } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import dayjs from 'dayjs';
import isEqual from 'fast-deep-equal';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  EllipsisIcon,
  ListFilterIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { createElement, memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useFetchAgentLabels } from '@/hooks/useFetchAgentLabels';
import { usePermission } from '@/hooks/usePermission';
import { useHomeStore } from '@/store/home';
import { agentLabelSelectors } from '@/store/home/selectors';

import { openDeleteLabelModal } from './DeleteLabelModal';
import { isDuplicateLabelNameError } from './errors';
import { openLabelFormModal } from './LabelFormModal';

const styles = createStaticStyles(({ css, cssVar }) => ({
  dot: css`
    flex: none;

    width: 10px;
    height: 10px;
    border-radius: 50%;

    background: ${cssVar.colorFill};
  `,
  row: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface LabelRowProps {
  canManage: boolean;
  label: AgentLabelListItem;
  manageBlockedReason?: string;
  onDelete: (label: AgentLabelListItem) => void;
  onEdit: (label: AgentLabelListItem) => void;
  /** Restoring hit an active label with the same name — offer rename-and-restore. */
  onRestoreConflict: (label: AgentLabelListItem) => void;
}

/** Shared column widths so the header and rows stay aligned. */
const NAME_COL_WIDTH = 200;
const USAGE_COL_WIDTH = 88;
const CREATED_COL_WIDTH = 96;
const ACTION_COL_WIDTH = 32;

const LabelRow = memo<LabelRowProps>(
  ({ canManage, label, manageBlockedReason, onDelete, onEdit, onRestoreConflict }) => {
    const { t } = useTranslation(['setting', 'common']);
    const updateAgentLabel = useHomeStore((s) => s.updateAgentLabel);

    const toggleArchive = () => {
      if (label.archived) {
        // Unarchive is non-destructive — no confirm needed.
        updateAgentLabel(label.id, { archived: false }).catch((error) => {
          // The name freed up by archiving may have been taken since. Archived
          // labels have no Edit action, so without this the label would be
          // stuck: hand the user a rename-and-restore form instead of a
          // dead-end "operation failed".
          if (isDuplicateLabelNameError(error)) {
            onRestoreConflict(label);
            return;
          }
          toast.error(t('operationFailed', { ns: 'common' }));
        });
        return;
      }
      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('workspaceSetting.labels.archive.desc'),
        okText: t('workspaceSetting.labels.actions.archive'),
        onOk: async () => {
          try {
            await updateAgentLabel(label.id, { archived: true });
            toast.success(t('workspaceSetting.labels.archive.success'));
          } catch (error) {
            console.error('Failed to archive label:', error);
            toast.error(t('operationFailed', { ns: 'common' }));
          }
        },
        title: t('workspaceSetting.labels.archive.title', { name: label.name }),
      });
    };

    // Archived labels are frozen: restore or delete only (mirrors Linear) —
    // editing would suggest they're still in active use.
    const menuItems = [
      ...(label.archived
        ? []
        : [
            {
              icon: (
                <span style={{ display: 'inline-flex' }}>
                  {createElement(PencilIcon, { size: 16 })}
                </span>
              ),
              key: 'edit',
              label: t('edit', { ns: 'common' }),
              onClick: () => onEdit(label),
            },
          ]),
      {
        icon: (
          <span style={{ display: 'inline-flex' }}>
            {createElement(label.archived ? ArchiveRestoreIcon : ArchiveIcon, { size: 16 })}
          </span>
        ),
        key: 'archive',
        label: label.archived
          ? t('workspaceSetting.labels.actions.unarchive')
          : t('workspaceSetting.labels.actions.archive'),
        onClick: toggleArchive,
      },
      { type: 'divider' as const },
      {
        danger: true,
        icon: (
          <span style={{ display: 'inline-flex' }}>{createElement(Trash2Icon, { size: 16 })}</span>
        ),
        key: 'delete',
        label: t('delete', { ns: 'common' }),
        onClick: () => onDelete(label),
      },
    ];

    const actions = canManage ? (
      <SidebarDropdownMenu items={menuItems}>
        <Button aria-label={t('more', { ns: 'common' })} size="icon-sm" variant="ghost">
          <EllipsisIcon aria-hidden size={16} />
        </Button>
      </SidebarDropdownMenu>
    ) : (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Button disabled aria-label={t('more', { ns: 'common' })} size="icon-sm" variant="ghost">
            <EllipsisIcon aria-hidden size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {manageBlockedReason ?? t('workspaceSetting.labels.manageBlocked')}
        </TooltipContent>
      </Tooltip>
    );

    return (
      <div
        className={styles.row}
        style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            flex: 'none',
            width: NAME_COL_WIDTH,
          }}
        >
          <span
            className={styles.dot}
            style={label.color ? { background: label.color } : undefined}
          />
          <span className="block min-w-0 truncate" style={{ fontWeight: 500 }}>
            {label.name}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          {label.description ? (
            <span
              className="block min-w-0 truncate"
              style={{ fontSize: 12, color: 'var(--muted-foreground)' }}
            >
              {label.description}
            </span>
          ) : null}
        </div>
        <span
          style={{
            fontSize: 12,
            color: 'var(--muted-foreground)',
            flex: 'none',
            textAlign: 'end',
            width: USAGE_COL_WIDTH,
          }}
        >
          {t('workspaceSetting.labels.usage', { count: label.usageCount })}
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--muted-foreground)',
            flex: 'none',
            textAlign: 'end',
            width: CREATED_COL_WIDTH,
          }}
        >
          {dayjs(label.createdAt).format('YYYY-MM-DD')}
        </span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flex: 'none',
            width: ACTION_COL_WIDTH,
          }}
        >
          {actions}
        </div>
      </div>
    );
  },
);

LabelRow.displayName = 'WorkspaceLabelRow';

/** Column header row, aligned with LabelRow via the shared widths. */
const LabelTableHeader = memo(() => {
  const { t } = useTranslation('setting');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingInline: 12,
        paddingBlock: 4,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: 'var(--muted-foreground)',
          flex: 'none',
          width: NAME_COL_WIDTH,
        }}
      >
        {t('workspaceSetting.labels.columns.name')}
      </span>
      <span
        className="block min-w-0 truncate"
        style={{ fontSize: 12, color: 'var(--muted-foreground)', flex: 1, minWidth: 0 }}
      >
        {t('workspaceSetting.labels.columns.description')}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--muted-foreground)',
          flex: 'none',
          textAlign: 'end',
          width: USAGE_COL_WIDTH,
        }}
      >
        {t('workspaceSetting.labels.columns.usage')}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--muted-foreground)',
          flex: 'none',
          textAlign: 'end',
          width: CREATED_COL_WIDTH,
        }}
      >
        {t('workspaceSetting.labels.columns.created')}
      </span>
      <span style={{ flex: 'none', width: ACTION_COL_WIDTH }} />
    </div>
  );
});

LabelTableHeader.displayName = 'WorkspaceLabelTableHeader';

/**
 * Workspace Settings → Labels — the agent-label registry management page:
 * create / edit (name, description, color), archive / unarchive, and
 * type-to-confirm delete with an archive escape hatch.
 */
const WorkspaceLabelsContent = memo(() => {
  const { t } = useTranslation(['setting', 'common']);
  const { error, isLoading, mutate } = useFetchAgentLabels();

  const isInit = useHomeStore(agentLabelSelectors.isLabelsInit);
  const allLabels = useHomeStore(agentLabelSelectors.allLabels, isEqual);

  // Inside a workspace, label management shares the workspace-settings gate:
  // admin/owner only, with buttons visible but disabled for members
  // (consistent with the rest of the settings surface). In personal mode the
  // registry belongs to the single user who owns it, so there is nobody to
  // gate against — `manage_settings` is a workspace-role signal and would
  // wrongly lock a personal user out of their own labels.
  const activeWorkspaceId = useActiveWorkspaceId();
  const { allowed: workspaceCanManage, reason: workspaceBlockedReason } =
    usePermission('manage_settings');
  const canManage = activeWorkspaceId ? workspaceCanManage : true;
  const manageBlockedReason = activeWorkspaceId ? workspaceBlockedReason : undefined;

  const [keyword, setKeyword] = useState('');
  // Linear-style scope filter: the default "workspace" scope lists active
  // labels; "archived" surfaces archived ones so they can be restored.
  const [scope, setScope] = useState<'archived' | 'workspace'>('workspace');
  const visibleLabels = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const matched = query
      ? allLabels.filter((label) => label.name.toLowerCase().includes(query))
      : allLabels;
    return matched.filter((label) => (scope === 'archived' ? label.archived : !label.archived));
  }, [allLabels, keyword, scope]);

  const renderRow = (label: AgentLabelListItem) => (
    <LabelRow
      canManage={canManage}
      key={label.id}
      label={label}
      manageBlockedReason={manageBlockedReason}
      onDelete={(target) => openDeleteLabelModal(target)}
      onEdit={(target) => openLabelFormModal({ label: target })}
      onRestoreConflict={(target) => openLabelFormModal({ label: target, restoreOnSave: true })}
    />
  );

  const newLabelButton = (
    <Button disabled={!canManage} variant="default" onClick={() => openLabelFormModal()}>
      <PlusIcon aria-hidden size={16} />
      {t('workspaceSetting.labels.actions.create')}
    </Button>
  );

  // The active-labels scope is named after where the registry lives, so it
  // reads "Workspace" for a team and "Personal" for a single user.
  const activeScopeLabel = t(
    activeWorkspaceId
      ? 'workspaceSetting.labels.scope.workspace'
      : 'workspaceSetting.labels.scope.personal',
  );
  const scopeLabel = (value: 'archived' | 'workspace') =>
    value === 'archived' ? t('workspaceSetting.labels.scope.archived') : activeScopeLabel;

  const scopeMenuItems = (['workspace', 'archived'] as const).map((value) => ({
    icon:
      value === scope ? (
        <span style={{ display: 'inline-flex' }}>{createElement(CheckIcon, { size: 16 })}</span>
      ) : undefined,
    key: value,
    label: scopeLabel(value),
    onClick: () => setScope(value),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <div className="relative w-full max-w-60">
            <Input
              aria-label={t('workspaceSetting.labels.filterPlaceholder')}
              className="pr-8"
              placeholder={t('workspaceSetting.labels.filterPlaceholder')}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            {keyword && (
              <Button
                aria-label={t('reset', { ns: 'common' })}
                className="absolute right-0 top-0"
                size="icon"
                variant="ghost"
                onClick={() => setKeyword('')}
              >
                <XIcon aria-hidden size={14} />
              </Button>
            )}
          </div>
          <SidebarDropdownMenu items={scopeMenuItems}>
            <Button variant="outline">
              <ListFilterIcon aria-hidden size={16} />
              {scopeLabel(scope)}
            </Button>
          </SidebarDropdownMenu>
        </div>
        {canManage ? (
          newLabelButton
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              {newLabelButton}
            </TooltipTrigger>
            <TooltipContent>
              {manageBlockedReason ?? t('workspaceSetting.labels.manageBlocked')}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {!isInit && isLoading ? (
        <SkeletonList rows={4} />
      ) : error && !isInit ? (
        // A failed load must not read as "you have no labels" — the two look
        // identical here and lead the user to create duplicates of labels that
        // already exist.
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            paddingBlock: 40,
          }}
        >
          <div
            className="flex flex-col items-center justify-center py-10 text-muted-foreground"
            role="status"
          >
            {t('workspaceSetting.labels.loadFailed')}
          </div>
          <Button variant="outline" onClick={() => mutate()}>
            {t('retry', { ns: 'common' })}
          </Button>
        </div>
      ) : visibleLabels.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-10 text-muted-foreground"
          role="status"
        >
          {keyword.trim()
            ? t('workspaceSetting.labels.filterEmpty')
            : scope === 'archived'
              ? t('workspaceSetting.labels.archivedEmpty')
              : t('workspaceSetting.labels.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <LabelTableHeader />
          {visibleLabels.map(renderRow)}
        </div>
      )}
    </div>
  );
});

WorkspaceLabelsContent.displayName = 'WorkspaceLabelsContent';

export default WorkspaceLabelsContent;
