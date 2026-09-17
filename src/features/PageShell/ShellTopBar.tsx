'use client';

import { DropdownMenu, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowLeft, ChevronsUpDownIcon, User, UserPlus } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';
import Avatar from '@/components/Avatar';
import { ProductLogo } from '@/components/Branding';
import { PresenceAvatarStack, useRoomConnection } from '@/features/Collaboration';
import { openInviteTeammateModal, useTeammatesEnabled } from '@/features/Teammates';
import UserAvatar from '@/features/User/UserAvatar';

/**
 * The application bar for pages that live OUTSIDE the main left-nav shell.
 *
 * The product's primary chrome is a vertical rail, which suits surfaces you
 * browse. A page someone was linked to needs the opposite: name the product
 * and the collection along the top edge, then get out of the way. Routes like
 * `/acceptance` are registered outside `(main)`, so without this bar they
 * begin at the very top of the window with no chrome at all — which is what
 * makes a standalone, shareable page read as an inner pane of a console.
 *
 * The bar owns no data beyond the workspace scope; the collection supplies its
 * own title, its menu, and where "back" goes.
 */
interface ShellTopBarProps {
  /** Trailing controls placed before the user avatar. */
  actions?: ReactNode;
  /**
   * Brand click target. The brand mark doubles as the way out: hovering swaps
   * it for a back arrow rather than spending a second slot on a control that
   * is only occasionally wanted.
   */
  onBack?: () => void;
  /** The collection this page belongs to, e.g. Deliveries. */
  title?: ReactNode;
  /** Sits right after the title — typically the button opening the list drawer. */
  titleExtra?: ReactNode;
}

const styles = createStaticStyles(({ css }) => ({
  back: css`
    position: absolute;
    inset: 0;

    display: grid;
    place-items: center;

    opacity: 0;
  `,
  brand: css`
    position: relative;
    inline-size: 26px;
    block-size: 26px;
    border-radius: ${cssVar.borderRadius};
  `,
  brandInteractive: css`
    cursor: pointer;

    &:hover .shell-brand-mark {
      opacity: 0;
    }

    &:hover .shell-brand-back {
      opacity: 1;
    }
  `,
  mark: css`
    position: absolute;
    inset: 0;

    display: grid;
    place-items: center;

    opacity: 1;
  `,
  root: css`
    flex: none;

    block-size: 48px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgLayout};
  `,
  scopePill: css`
    cursor: default;
    padding-block: 3px;
    padding-inline: 6px;
    border-radius: ${cssVar.borderRadius};
  `,
}));

/**
 * Workspace-scope presence for the top bar: joins `workspace:{id}` for as
 * long as the bar is mounted, then renders the deduplicated avatar stack.
 * The room connection is refcounted — a project board holding its own room
 * never pays for a second socket here.
 */
const WorkspacePresence = memo<{ workspaceId: string }>(({ workspaceId }) => {
  const room = { id: workspaceId, scope: 'workspace' as const };
  useRoomConnection(room);
  return <PresenceAvatarStack room={room} />;
});

WorkspacePresence.displayName = 'WorkspacePresence';

const ShellTopBar = ({ actions, onBack, title, titleExtra }: ShellTopBarProps) => {
  const { t } = useTranslation('setting');
  const workspace = useActiveWorkspace();
  const workspaces = useWorkspaces();
  const capabilities = useWorkspaceCapabilities();
  const teammatesEnabled = useTeammatesEnabled();
  const { switchToPersonal, switchWorkspace } = useSwitchWorkspace();

  // The pill is a SCOPE SWITCHER, not an identity label. Personal scope has no
  // scope to switch to, so the bar is the product, the collection, and you.
  // Inside a workspace the menu is always offered — even with a single
  // workspace — because "Personal" is then a distinct scope to return to.
  const switchable = workspaces.length > 1 || Boolean(workspace);
  const scopeName = workspace?.name;
  const scopeAvatar = workspace?.avatar || scopeName;

  const scopeMenu = switchable
    ? [
        {
          icon: <Icon icon={User} size={14} />,
          key: '__personal__',
          label: t('workspaceSetting.members.personalScope'),
          onClick: () => {
            if (workspace) void switchToPersonal();
          },
        },
        ...workspaces.map((item) => ({
          icon: <Avatar avatar={item.avatar || item.name} shape={'square'} size={18} />,
          key: item.id,
          label: item.name,
          onClick: () => {
            if (item.id !== workspace?.id) void switchWorkspace(item.id);
          },
        })),
      ]
    : [];

  const scopePill = scopeName ? (
    <Flexbox horizontal align={'center'} className={styles.scopePill} gap={6}>
      <Avatar avatar={scopeAvatar} shape={'square'} size={20} />
      <Text fontSize={13} weight={600}>
        {scopeName}
      </Text>
      {switchable && <ChevronsUpDownIcon color={cssVar.colorTextQuaternary} size={12} />}
    </Flexbox>
  ) : null;

  return (
    <Flexbox horizontal align={'center'} className={styles.root} gap={8}>
      <div
        className={onBack ? `${styles.brand} ${styles.brandInteractive}` : styles.brand}
        onClick={onBack}
      >
        <div className={`shell-brand-mark ${styles.mark}`}>
          <ProductLogo size={22} />
        </div>
        {onBack && (
          <div className={`shell-brand-back ${styles.back}`}>
            <Icon icon={ArrowLeft} size={17} />
          </div>
        )}
      </div>

      {title && (
        <Text ellipsis fontSize={15} style={{ minWidth: 0 }} weight={600}>
          {title}
        </Text>
      )}
      {titleExtra}

      {scopePill &&
        (switchable ? <DropdownMenu items={scopeMenu}>{scopePill}</DropdownMenu> : scopePill)}

      <Flexbox flex={1} />
      {workspace && <WorkspacePresence workspaceId={workspace.id} />}
      {actions}
      {workspace && teammatesEnabled && capabilities.canInvite && (
        <Tooltip title={t('workspaceSetting.members.inviteButton')}>
          <Button
            aria-label={t('workspaceSetting.members.inviteButton')}
            icon={<Icon icon={UserPlus} size={15} />}
            size="small"
            variant="text"
            onClick={() => openInviteTeammateModal()}
          />
        </Tooltip>
      )}
      <UserAvatar clickable size={26} />
    </Flexbox>
  );
};

export default ShellTopBar;
