'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, Button, type DropdownItem, DropdownMenu, Modal } from '@lobehub/ui/base-ui';
import type { SavedViewVisibility } from '@orvilo/types';
import {
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  FolderInputIcon,
  Link2Icon,
  SquarePenIcon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ViewDefinitionEditor, { type ViewEditorState } from './ViewDefinitionEditor';

interface SavedViewActionsMenuProps {
  /** Only the owner may edit/move/delete the saved definition. */
  canEdit: boolean;
  dirty: boolean;
  draft: ViewEditorState | null;
  exporting: boolean;
  onCancelDraft: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onDraftChange: (state: ViewEditorState) => void;
  onDuplicate: () => void;
  onExportCsv: () => void;
  onMoveTo: (visibility: SavedViewVisibility, teamId?: string) => void;
  onReloadDraft: () => void;
  onSave: () => Promise<boolean>;
  shareReady: boolean;
  /** Teams the visitor has joined — the "Move to" submenu's team targets. */
  teamOptions: { id: string; name: string }[];
  workspaceId?: string | null;
}

/**
 * Detail-page `…` menu plus its "Edit view" modal. Mirrors the reference
 * menu (Edit view · Duplicate view · Move to… · Copy link · Export CSV ·
 * Delete). Reference extras are omitted honestly:
 * - "Subscribe" — `workAttention.subscribe` is task-scoped; there is no
 *   saved-view subscription contract.
 * - "Slack notifications" — no Slack integration exists in this product.
 */
const SavedViewActionsMenu = memo<SavedViewActionsMenuProps>((props) => {
  const {
    canEdit,
    dirty,
    draft,
    exporting,
    shareReady,
    teamOptions,
    onCancelDraft,
    onCopyLink,
    onDelete,
    onDraftChange,
    onDuplicate,
    onExportCsv,
    onMoveTo,
    onReloadDraft,
    onSave,
    workspaceId,
  } = props;
  const { t } = useTranslation('common');
  const [editing, setEditing] = useState(false);

  const items = useMemo<DropdownItem[]>(() => {
    const list: DropdownItem[] = [];
    if (canEdit) {
      list.push({
        icon: <Icon icon={SquarePenIcon} size={14} />,
        key: 'edit',
        label: t('savedViews.editView'),
        onClick: () => {
          // Edit always starts from the persisted definition.
          onReloadDraft();
          setEditing(true);
        },
      });
    }
    list.push({
      icon: <Icon icon={CopyIcon} size={14} />,
      key: 'duplicate',
      label: t('savedViews.duplicateView'),
      onClick: onDuplicate,
    });
    if (canEdit) {
      const moveTargets: DropdownItem[] = [
        {
          key: 'move-private',
          label: t('savedViews.moveToPrivate'),
          onClick: () => onMoveTo('private'),
        },
        ...(workspaceId
          ? [
              {
                key: 'move-workspace',
                label: t('savedViews.moveToWorkspace'),
                onClick: () => onMoveTo('workspace'),
              },
            ]
          : []),
        ...teamOptions.map((team) => ({
          key: `move-team-${team.id}`,
          label: team.name,
          onClick: () => onMoveTo('team', team.id),
        })),
      ];
      if (moveTargets.length > 0) {
        list.push({
          children: moveTargets,
          icon: <Icon icon={FolderInputIcon} size={14} />,
          key: 'move-to',
          label: t('savedViews.moveTo'),
          openOnHover: true,
          type: 'submenu',
        });
      }
    }
    list.push(
      {
        icon: <Icon icon={Link2Icon} size={14} />,
        key: 'copy-link',
        label: t('savedViews.copyLink'),
        onClick: onCopyLink,
      },
      {
        icon: <Icon icon={DownloadIcon} size={14} />,
        key: 'export-csv',
        label: exporting ? t('savedViews.exportingCsv') : t('savedViews.exportCsv'),
        onClick: onExportCsv,
      },
    );
    if (canEdit) {
      list.push(
        { type: 'divider' },
        {
          danger: true,
          key: 'delete',
          label: t('savedViews.delete'),
          onClick: onDelete,
        },
      );
    }
    return list;
  }, [
    canEdit,
    exporting,
    onCopyLink,
    onDelete,
    onDuplicate,
    onExportCsv,
    onMoveTo,
    onReloadDraft,
    t,
    teamOptions,
    workspaceId,
  ]);

  const closeEditor = () => {
    setEditing(false);
    onCancelDraft();
  };

  return (
    <>
      <DropdownMenu items={items} placement="bottomRight">
        <ActionIcon aria-label={t('savedViews.viewOptions')} icon={EllipsisIcon} size="small" />
      </DropdownMenu>
      {/* Menu "Edit view" — the same editor state machine as the inline
          Filters/Display controls, presented modally for owners. */}
      <Modal
        destroyOnHidden
        open={editing}
        title={t('savedViews.editView')}
        width={640}
        footer={
          <Flexbox horizontal gap={8} justify="flex-end">
            <Button onClick={closeEditor}>{t('cancel')}</Button>
            <Button
              disabled={!dirty || !shareReady || !draft?.name.trim()}
              type="primary"
              onClick={() =>
                void onSave().then((saved) => {
                  if (saved) setEditing(false);
                })
              }
            >
              {t('save')}
            </Button>
          </Flexbox>
        }
        onCancel={closeEditor}
      >
        <Flexbox gap={16} paddingBlock={8}>
          {draft ? (
            <ViewDefinitionEditor showName showShare value={draft} onChange={onDraftChange} />
          ) : null}
        </Flexbox>
      </Modal>
    </>
  );
});

SavedViewActionsMenu.displayName = 'SavedViewActionsMenu';

export default SavedViewActionsMenu;
