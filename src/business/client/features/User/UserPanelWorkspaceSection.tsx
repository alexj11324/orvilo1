'use client';

import { cssVar } from 'antd-style';
import { CheckIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';
import UserAvatar from '@/features/User/UserAvatar';

interface UserPanelWorkspaceSectionProps {
  onSwitch?: () => void;
}

/**
 * Workspace switcher rows inside the user panel — Linear's model: there is no
 * personal space, so the section lists only workspace memberships with a
 * check on the active one. Provisioning guarantees at least one row
 * (`workspace.ensureDefault` runs on boot), so this never renders empty.
 */
const UserPanelWorkspaceSection = memo<UserPanelWorkspaceSectionProps>(({ onSwitch }) => {
  const { t } = useTranslation('common');
  const workspaces = useWorkspaces();
  const activeWorkspaceId = useActiveWorkspaceId();
  const { switchWorkspace } = useSwitchWorkspace();

  const handlePick = useCallback(
    async (workspaceId: string) => {
      if (workspaceId === activeWorkspaceId) {
        onSwitch?.();
        return;
      }
      try {
        await switchWorkspace(workspaceId);
      } finally {
        onSwitch?.();
      }
    },
    [activeWorkspaceId, onSwitch, switchWorkspace],
  );

  const row = (
    key: string,
    name: string,
    avatar: string | null | undefined,
    selected: boolean,
    onClick: () => void,
  ) => (
    <div
      className="flex items-center gap-2 p-2"
      key={key}
      style={{ borderRadius: 8, cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = cssVar.colorFillTertiary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <UserAvatar
        avatarOverride={avatar ?? undefined}
        nameOverride={name}
        shape={'square'}
        size={20}
      />
      <div className="truncate min-w-0 text-[13px]" style={{ flex: 1 }}>
        {name}
      </div>
      {selected && <CheckIcon size={16} style={{ color: cssVar.colorTextSecondary }} />}
    </div>
  );

  return (
    <div className="flex flex-col gap-px px-1">
      <div className="text-[11px] text-muted-foreground font-medium" style={{ paddingInline: 8 }}>
        {t('workspaceSwitcher.label')}
      </div>
      {workspaces.map((workspace) =>
        row(
          workspace.id,
          workspace.name || workspace.slug,
          workspace.avatar,
          workspace.id === activeWorkspaceId,
          () => void handlePick(workspace.id),
        ),
      )}
    </div>
  );
});

UserPanelWorkspaceSection.displayName = 'UserPanelWorkspaceSection';

export default UserPanelWorkspaceSection;
