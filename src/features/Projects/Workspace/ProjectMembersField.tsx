import { createStaticStyles } from 'antd-style';
import { UsersIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  type useProjectMembersQuery,
  useTeammateActions,
  useWorkspaceMembersQuery,
} from '@/features/Teammates/api/hooks';
import { openInviteTeammateModal } from '@/features/Teammates/InviteTeammateModal';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const styles = createStaticStyles(({ css }) => ({
  label: css`
    position: absolute;

    overflow: hidden;

    width: 1px;
    height: 1px;

    white-space: nowrap;

    clip-path: inset(50%);
  `,
  field: css`
    width: auto;
    min-width: 0;
    max-width: 100%;
    min-height: 28px;
    border-color: transparent;

    font-size: 13px;

    background: transparent;
  `,
}));

// Combobox values are strings; this sentinel marks the "invite teammate"
// pseudo-option in the members picker.
const INVITE_TEAMMATE_VALUE = '__inviteTeammate__';

export function ProjectMembersField({
  projectId,
  query,
}: {
  projectId: string;
  query: ReturnType<typeof useProjectMembersQuery>;
}) {
  const { t } = useTranslation('project');
  const id = useId();
  const lock = useRef(false);
  const inviting = useRef(false);
  const [open, setOpen] = useState(false);
  const roster = useWorkspaceMembersQuery();
  const capabilities = useWorkspaceCapabilities();
  const userId = useUserStore(userProfileSelectors.userId);
  const { addProjectMember, removeProjectMember, mutating } = useTeammateActions();
  const members = query.data ?? [];
  const canEdit =
    capabilities.canManageMembers ||
    (capabilities.role === 'member' &&
      members.some((member) => member.userId === userId && member.role === 'manager'));
  const failed = (query.error && !query.data) || (roster.error && !roster.data);
  if (failed)
    return (
      <AsyncError
        error={failed}
        variant="inline"
        onRetry={() => {
          void query.mutate();
          void roster.mutate();
        }}
      />
    );
  const available = (roster.data ?? []).filter(
    (member) => !member.deletedAt && !member.suspendedAt,
  );
  const options = available.map((member) => ({
    userId: member.userId,
    user: member.user,
    disabled: false,
  }));
  for (const member of members) {
    // Keep departed members removable. Once removed, they disappear from the
    // choices because only active workspace members may be added again.
    if (!options.some((option) => option.userId === member.userId))
      options.push({ userId: member.userId, user: member.user ?? null, disabled: false });
  }
  const memberPickerOptions = [
    ...options.map((member) => {
      const name = member.user?.fullName || member.user?.username || member.userId;
      return {
        disabled: member.disabled,
        label: (
          <div className="flex flex-row" style={{ alignItems: 'center', gap: 6 }}>
            <Avatar avatar={member.user?.avatar ?? undefined} name={name} size={18} />
            {name}
          </div>
        ),
        title: name,
        value: member.userId,
      };
    }),
    ...(capabilities.canInvite
      ? [
          {
            label: t('properties.inviteAndAdd'),
            value: INVITE_TEAMMATE_VALUE,
          },
        ]
      : []),
  ];
  return (
    <>
      <label className={styles.label} htmlFor={id}>
        {t('properties.members')}
      </label>
      <Combobox
        multiple
        disabled={!canEdit || mutating || query.isLoading || roster.isLoading}
        items={memberPickerOptions.map((option) => option.value)}
        open={open}
        value={members.map((member) => member.userId)}
        itemToStringLabel={(value) => {
          const option = memberPickerOptions.find((option) => option.value === value);
          return option && 'title' in option && typeof option.title === 'string'
            ? option.title
            : typeof option?.label === 'string'
              ? option.label
              : String(value);
        }}
        onOpenChange={(nextOpen) => {
          if (!nextOpen || !inviting.current) setOpen(nextOpen);
        }}
        onValueChange={async (value) => {
          if (lock.current || !canEdit || !Array.isArray(value)) return;
          if (value.includes(INVITE_TEAMMATE_VALUE)) {
            if (capabilities.canInvite) {
              inviting.current = true;
              setOpen(false);
              openInviteTeammateModal({
                defaultProjectIds: [projectId],
                onClosed: () => {
                  inviting.current = false;
                },
              });
            }
            return;
          }
          lock.current = true;
          try {
            const current = new Set(members.map((member) => member.userId));
            const next = new Set(value.filter((id) => id !== INVITE_TEAMMATE_VALUE));
            for (const memberId of next) {
              if (
                !current.has(memberId) &&
                !(await addProjectMember(projectId, memberId, 'contributor'))
              )
                return;
            }
            for (const memberId of current) {
              if (!next.has(memberId) && !(await removeProjectMember(projectId, memberId))) return;
            }
          } finally {
            lock.current = false;
          }
        }}
      >
        <>
          <ComboboxChips className="min-w-0 max-w-full">
            <UsersIcon aria-hidden size={16} />
            {members
              .map((member) => member.userId)
              .map((value) => (
                <ComboboxChip key={value}>
                  {memberPickerOptions.find((option) => option.value === value)?.label ??
                    String(value)}
                </ComboboxChip>
              ))}
            <ComboboxChipsInput
              aria-label={t('properties.members')}
              disabled={!canEdit || mutating || query.isLoading || roster.isLoading}
              id={id}
              placeholder={t('properties.membersEmpty')}
            />
          </ComboboxChips>
          <ComboboxContent className="min-w-56">
            <ComboboxEmpty>{t('properties.membersEmpty')}</ComboboxEmpty>
            <ComboboxList>
              {(value: (typeof memberPickerOptions)[number]['value']) => {
                const option = memberPickerOptions.find((option) => option.value === value);
                return (
                  <ComboboxItem
                    disabled={!!option && 'disabled' in option && option.disabled === true}
                    key={value}
                    value={value}
                  >
                    {option?.label}
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
          </ComboboxContent>
        </>
      </Combobox>
    </>
  );
}
