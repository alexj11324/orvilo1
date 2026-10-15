'use client';

import {
  ArrowLeftIcon,
  Clock3Icon,
  CopyPlus,
  Download,
  EyeOffIcon,
  Link2,
  Maximize2,
  MoreHorizontal,
  Trash2,
  UsersIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ShareButton from '@/business/client/features/PageShare/ShareButton';
import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { toast } from '@/components/toast';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import AutoSaveHint from '@/features/EditorCanvas/AutoSaveHint';
import NavHeader from '@/features/NavHeader';
import SidebarDropdownMenu, {
  type SidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';

import { formatPageEditorInfoTime } from '../../formatPageEditorInfoTime';
import { usePageAgentPanelControl } from '../../RightPanel/OverrideContext';
import type { NativePageChromeState } from '../NativePageEditorAssembler';
import { NativePageBreadcrumb } from './NativePageBreadcrumb';

// Header work/navigation actions use the approved compact32 role.
const HEADER_ACTION_SIZE = {
  ...DESKTOP_HEADER_ICON_SMALL_SIZE,
  blockSize: 32,
  borderRadius: 'var(--radius-button)',
} as const;
export function NativePageHeader({ state }: { state: NativePageChromeState }) {
  const { t } = useTranslation(['file', 'common', 'chat']);
  const panel = usePageAgentPanelControl();
  const [error, setError] = useState<unknown>();
  const [retry, setRetry] = useState<() => Promise<void>>();
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<void>) => {
    if (busy) return;
    setError(undefined);
    setBusy(true);
    void action()
      .catch((nextError) => {
        setError(nextError);
        setRetry(() => action);
      })
      .finally(() => setBusy(false));
  };
  const openHistory = () => {
    state.setRightPanelMode('history');
    panel.toggle(true);
  };
  const canExpand = state.editable || state.rightPanelMode === 'history';
  const menuItems: SidebarMenuItems = [
    ...(state.canToggleWideScreen
      ? [
          {
            key: 'full-width',
            type: 'checkbox',
            icon: <Maximize2 />,
            checked: state.wideScreen,
            label: t('viewMode.fullWidth', { ns: 'chat' }),
            onCheckedChange: state.toggleWideScreen,
          },
          { type: 'divider' },
        ]
      : []),
    ...(state.canMakePrivate
      ? [
          {
            key: 'make-private',
            icon: <EyeOffIcon />,
            label: t('makePrivate', { ns: 'common' }),
            onClick: () => run(state.makePrivate),
          },
          { type: 'divider' },
        ]
      : []),
    {
      key: 'duplicate',
      icon: <CopyPlus />,
      disabled: busy || !state.canCreate,
      label: t('pageList.duplicate', { ns: 'file' }),
      onClick: () =>
        run(async () => {
          await state.duplicate();
          toast.success(t('pageEditor.duplicateSuccess', { ns: 'file' }));
        }),
    },
    {
      key: 'copy-link',
      icon: <Link2 />,
      disabled: busy,
      label: t('pageEditor.menu.copyLink', { ns: 'file' }),
      onClick: () =>
        run(async () => {
          await state.copyLink();
          toast.success(t('pageEditor.linkCopied', { ns: 'file' }));
        }),
    },
    {
      key: 'version-history',
      icon: <Clock3Icon />,
      label: t('pageEditor.history.title', { ns: 'file' }),
      onClick: openHistory,
    },
    {
      key: 'delete',
      icon: <Trash2 />,
      danger: true,
      disabled: !state.canDelete,
      label: t('delete', { ns: 'common' }),
      onClick: state.remove,
    },
    { type: 'divider' },
    ...(state.transferMenuItems ?? []),
    ...(state.canPublish
      ? [
          {
            key: 'publish-to-workspace',
            icon: <UsersIcon />,
            label: t('pageList.publishToWorkspace', { ns: 'file' }),
            onClick: () => run(state.publish),
          },
        ]
      : []),
    {
      key: 'export',
      icon: <Download />,
      label: t('pageEditor.menu.export', { ns: 'file' }),
      children: [
        {
          key: 'export-markdown',
          disabled: busy,
          label: t('pageEditor.menu.export.markdown', { ns: 'file' }),
          onClick: () => run(state.exportMarkdown),
        },
      ],
    },
    ...(state.lastUpdatedTime || state.authorName
      ? [
          { type: 'divider' },
          {
            key: 'page-info',
            disabled: true,
            label: (
              <span className="text-xs text-foreground-tertiary">
                {state.authorName && state.lastUpdatedTime
                  ? t('pageEditor.editedAtBy', {
                      name: state.authorName,
                      time: formatPageEditorInfoTime(state.lastUpdatedTime),
                      ns: 'file',
                    })
                  : state.lastUpdatedTime
                    ? t('pageEditor.editedAt', {
                        time: formatPageEditorInfoTime(state.lastUpdatedTime),
                        ns: 'file',
                      })
                    : t('pageEditor.editedBy', { name: state.authorName ?? '', ns: 'file' })}
              </span>
            ),
          },
        ]
      : []),
  ];
  return (
    <>
      <NavHeader
        left={
          <>
            {state.canGoBack ? (
              <ActionIcon
                aria-label={t('back', { ns: 'common' })}
                disabled={busy}
                icon={ArrowLeftIcon}
                size={HEADER_ACTION_SIZE}
                onClick={() => run(state.back)}
              />
            ) : null}
            {state.parentId ? (
              <NativePageBreadcrumb state={state} />
            ) : (
              <>
                {state.emoji ? <Avatar avatar={state.emoji} shape="square" size={28} /> : null}
                <div className="ms-1 min-w-0 truncate text-sm font-medium">
                  {state.title || t('pageEditor.titlePlaceholder', { ns: 'file' })}
                </div>
              </>
            )}
            <span className="ms-2">
              <AutoSaveHint documentId={state.documentId} />
            </span>
          </>
        }
        right={
          <>
            <ShareButton documentId={state.documentId} />
            <SidebarDropdownMenu items={menuItems} placement="bottomRight">
              <ActionIcon
                aria-label={t('more', { ns: 'common' })}
                icon={MoreHorizontal}
                size={HEADER_ACTION_SIZE}
              />
            </SidebarDropdownMenu>
            {canExpand ? (
              <ToggleRightPanelButton
                hideWhenExpanded
                expand={panel.expand}
                showActive={false}
                size={HEADER_ACTION_SIZE}
                onToggle={() => panel.toggle()}
              />
            ) : null}
          </>
        }
      />
      {error ? (
        <AsyncError
          error={error}
          retrying={busy}
          variant="inline"
          onRetry={retry ? () => run(retry) : undefined}
        />
      ) : null}
    </>
  );
}
