import { createStaticStyles } from 'antd-style';
import { UsersIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import AvatarGroup from '@/components/Avatar/AvatarGroup';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type useProjectMembersQuery,
  useTeammateActions,
  useWorkspaceMembersQuery,
} from '@/features/Teammates/api/hooks';
import { openInviteTeammateModal } from '@/features/Teammates/InviteTeammateModal';

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
  projectVisibility,
  query,
  canManage = false,
  onChanged,
}: {
  projectId: string;
  projectVisibility?: 'private' | 'public' | null;
  canManage?: boolean;
  onChanged?: () => Promise<unknown>;
  query: ReturnType<typeof useProjectMembersQuery>;
}) {
  const { t } = useTranslation(['project', 'setting']);
  const id = useId();
  const lock = useRef(false);
  const inviting = useRef(false);
  const [open, setOpen] = useState(false);
  const roster = useWorkspaceMembersQuery();
  const capabilities = useWorkspaceCapabilities();
  const { addProjectMember, changeProjectMemberRole, removeProjectMember, mutating } =
    useTeammateActions();
  const members = query.data ?? [];
  const canEdit = canManage;
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
          <ComboboxTrigger
            aria-label={t('properties.members')}
            className="h-7 w-auto max-w-full shrink-0 gap-2 rounded-full border-0 bg-transparent px-1.5 py-1 text-sm font-medium shadow-none hover:bg-accent focus-visible:bg-accent data-popup-open:bg-accent [&[data-slot=combobox-trigger]>svg:last-child]:hidden"
            id={id}
            render={<Button variant="ghost" />}
          >
            {members.length ? (
              <AvatarGroup
                max={3}
                size={18}
                items={members.map((member) => ({
                  key: member.userId,
                  avatar: member.user?.avatar ?? undefined,
                  title: member.user?.fullName || member.user?.username || member.userId,
                }))}
              />
            ) : (
              <UsersIcon aria-hidden size={16} />
            )}
            <span className="truncate">
              {members.length
                ? members
                    .map(
                      (member) => member.user?.fullName || member.user?.username || member.userId,
                    )
                    .join(', ')
                : t('properties.membersEmpty')}
            </span>
          </ComboboxTrigger>
          <ComboboxContent className="min-w-56">
            <ComboboxInput
              aria-label={t('properties.membersEmpty')}
              placeholder={t('properties.membersEmpty')}
              showTrigger={false}
            />
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
      {members.map((member) => {
        const name = member.user?.fullName || member.user?.username || member.userId;
        if (
          projectVisibility === 'private' &&
          (member.role === 'viewer' || member.role === 'commenter')
        ) {
          return (
            <span className="text-sm text-muted-foreground" key={member.userId} title={name}>
              {t(`setting:workspaceSetting.members.projectRole.${member.role}`)}
            </span>
          );
        }
        const role = member.role === 'manager' ? 'manager' : 'contributor';
        return (
          <Select
            disabled={!canManage || mutating}
            key={member.userId}
            value={role}
            items={(['contributor', 'manager'] as const).map((value) => ({
              value,
              label: t(`setting:workspaceSetting.members.projectRole.${value}`),
            }))}
            onValueChange={async (value) => {
              if (
                canManage &&
                (value === 'contributor' || value === 'manager') &&
                (await changeProjectMemberRole(projectId, member.userId, value))
              )
                await onChanged?.();
            }}
          >
            <SelectTrigger aria-label={`${name}: ${t('properties.members')}`} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contributor">
                {t('setting:workspaceSetting.members.projectRole.contributor')}
              </SelectItem>
              <SelectItem value="manager">
                {t('setting:workspaceSetting.members.projectRole.manager')}
              </SelectItem>
            </SelectContent>
          </Select>
        );
      })}
    </>
  );
}
