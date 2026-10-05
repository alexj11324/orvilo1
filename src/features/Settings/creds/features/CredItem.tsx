'use client';
import { type OwnCredSummary } from '@orvilo/types';
import {
  Eye,
  File,
  Globe,
  Key,
  MoreHorizontalIcon,
  Pencil,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import { type FC, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/hooks/usePermission';

interface CredItemProps {
  cred: OwnCredSummary;
  /**
   * Extra content rendered before the "..." menu — used by the workspace
   * credential page to slot in the personal-credential share toggle without
   * duplicating this row's layout.
   */
  extra?: React.ReactNode;
  /**
   * Action handlers are optional: omit them all to render a row without the
   * "..." menu — e.g. the workspace page's personal tab, where management is
   * gated by an owner-only workspace permission the caller's own credentials
   * shouldn't answer to, so the menu would only ever render disabled. CRUD
   * for those rows lives on the personal settings page instead.
   */
  onDelete?: (id: string) => void;
  onEdit?: (cred: OwnCredSummary) => void;
  onView?: (cred: OwnCredSummary) => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  'file': <File size={20} />,
  'kv-env': <TerminalSquare size={20} />,
  'kv-header': <Globe size={20} />,
  'oauth': <Key size={20} />,
};

const CredItem: FC<CredItemProps> = memo(({ cred, extra, onEdit, onDelete, onView }) => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials } = usePermission('manage_provider_key');

  const handleDelete = () => {
    if (!canManageCredentials) return;

    confirmModal({
      content: t('creds.actions.deleteConfirm.content'),
      okButtonProps: { danger: true },
      okText: t('creds.actions.deleteConfirm.ok'),
      onOk: () => onDelete?.(cred.id),
      title: t('creds.actions.deleteConfirm.title'),
    });
  };

  const canView = canManageCredentials && (cred.type === 'kv-env' || cred.type === 'kv-header');

  const menuItems = [
    ...(onView && canView
      ? [
          {
            icon: <Eye className="shrink-0" />,
            key: 'view',
            label: t('creds.actions.view'),
            onClick: () => onView(cred),
          },
        ]
      : []),
    ...(onEdit
      ? [
          {
            icon: <Pencil className="shrink-0" />,
            key: 'edit',
            label: t('creds.actions.edit'),
            disabled: !canManageCredentials,
            onClick: () => onEdit(cred),
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            danger: true,
            disabled: !canManageCredentials,
            icon: <Trash2 className="shrink-0" />,
            key: 'delete',
            label: t('creds.actions.delete'),
            onClick: handleDelete,
          },
        ]
      : []),
  ];

  const renderAvatar = () => {
    if (cred.type === 'oauth' && cred.oauthAvatar) {
      return (
        <Avatar>
          <AvatarImage alt="" src={cred.oauthAvatar} />
        </Avatar>
      );
    }
    return (
      // `display: flex` collapses the inline span's line box so the svg sits
      // dead-center in the 48px container instead of on the text baseline.
      <span className="flex text-muted-foreground">{typeIcons[cred.type]}</span>
    );
  };

  return (
    <div className={`flex flex-row gap-[16px] items-center justify-between ${'py-3'}`}>
      <div
        className="flex flex-row gap-[16px] items-center"
        style={{ flex: 1, overflow: 'hidden' }}
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
          {renderAvatar()}
        </div>
        <div className="flex flex-col gap-[4px]" style={{ overflow: 'hidden' }}>
          <div>
            <span className="text-[15px] font-medium">{cred.name}</span>
            <span className="inline-flex rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs">
              {t(`creds.types.${cred.type}`)}
            </span>
            {/* Only populated by workspace-scoped list responses (workspaceCreds.list) —
                distinguishes a member's shared personal credential from one the workspace owns directly. */}
            {!!cred.ownerDisplayName && (
              <span className="inline-flex rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs">
                {t('creds.owner.sharedBy', { name: cred.ownerDisplayName })}
              </span>
            )}
          </div>
          <div>
            <code className="font-mono text-xs text-muted-foreground">{cred.key}</code>
            {cred.description && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-xs text-muted-foreground">{cred.description}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-row gap-[8px] items-center" onClick={(e) => e.stopPropagation()}>
        {extra}
        {menuItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t('creds.actions.edit')}
                  disabled={!canManageCredentials}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menuItems.map((item) => (
                <DropdownMenuItem
                  disabled={'disabled' in item && item.disabled}
                  key={item.key}
                  variant={'danger' in item && item.danger ? 'destructive' : 'default'}
                  onClick={item.onClick}
                >
                  {item.icon}
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});

CredItem.displayName = 'CredItem';

export default CredItem;
