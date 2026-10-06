'use client';

import { useTheme } from 'antd-style';
import { MoreHorizontalIcon, UsersIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import urlJoin from 'url-join';

import { useAgentGroupTransferMenuItem } from '@/business/client/hooks/useAgentGroupTransferMenuItem';
import { useAgentGroupTransferToMemberMenuItem } from '@/business/client/hooks/useAgentGroupTransferToMemberMenuItem';
import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import ActionIcon from '@/components/ActionIcon';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EditingIndicator, type EditLockClient, useEditLock } from '@/features/EditLock';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import AccessLevelTag from '@/features/ResourcePermission/AccessLevelTag';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useSaveState } from '@/hooks/useSaveState';
import { lambdaClient } from '@/libs/trpc/client';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useGroupProfileStore } from '@/store/groupProfile';

import { useBasicSettingsDraft } from './useBasicSettingsDraft';

// Stable lock RPC binding for the chatGroup resource.
const groupLockClient: EditLockClient = {
  acquire: (id) => lambdaClient.group.acquireGroupLock.mutate({ id }),
  peek: (id) => lambdaClient.group.getGroupLock.query({ id }),
  release: async (id) => {
    await lambdaClient.group.releaseGroupLock.mutate({ id });
  },
};

const GroupProfile = () => {
  const { t } = useTranslation(['setting', 'chat', 'agentGroup', 'common']);
  const { allowed: hasEditPermission } = usePermission('edit_own_content');
  const theme = useTheme();
  const { gid } = useParams<{ gid: string }>();
  const groupId = gid;
  const hasActiveWorkspace = useHasActiveWorkspace();
  const currentGroup = useAgentGroupStore((s) => agentGroupSelectors.getGroupById(gid ?? '')(s));
  const updateGroup = useAgentGroupStore((s) => s.updateGroup);
  // The profile page keeps its active tab in `?tab=`; the permission page has no
  // tabs, so navigate without carrying the query over (unlike `router.push`).
  const navigate = useWorkspaceAwareNavigate();
  const transferMenuItems = useAgentGroupTransferMenuItem(groupId ?? undefined);
  const transferToMemberItem = useAgentGroupTransferToMemberMenuItem(groupId ?? undefined);
  // A workspace member whose General access on this group is view/use level
  // can't edit it (defaults permissive while loading — server enforces).
  const { canEditResource } = useResourceAccess(
    'agentGroup',
    currentGroup?.visibility === 'private' ? undefined : (groupId ?? undefined),
  );
  const canEdit = hasEditPermission && canEditResource;

  // Member-permission entry lives inside the "..." menu and opens the dedicated
  // page, matching the agent profile header. Shown for private groups too: the
  // creator sets there what members get the moment the group is published.
  const showPermissionPageEntry = hasActiveWorkspace && !!groupId;
  const moreMenuItems = useMemo(() => {
    const permissionMenuItem = showPermissionPageEntry
      ? {
          // Same gate the page itself applies (ResourceConfigAccessGate):
          // without edit-level access it redirects straight back with a toast,
          // so an enabled entry here is a click into a dead end. Disabled, not
          // hidden — the member can still see the action exists.
          disabled: !canEdit,
          icon: <UsersIcon />,
          key: 'permission',
          label: t('permission.page.entry', { ns: 'setting' }),
          onClick: () => {
            if (!canEdit || !groupId) return;
            navigate(urlJoin('/group', groupId, 'permission'));
          },
        }
      : null;

    return [
      permissionMenuItem,
      permissionMenuItem && (transferMenuItems?.length || transferToMemberItem)
        ? ({ type: 'divider' } as const)
        : null,
      ...(transferMenuItems ?? []),
      transferToMemberItem,
    ].filter(Boolean);
  }, [
    canEdit,
    groupId,
    navigate,
    showPermissionPageEntry,
    t,
    transferMenuItems,
    transferToMemberItem,
  ]);

  const { draft, setDraft, dirty } = useBasicSettingsDraft(
    currentGroup?.title ?? '',
    currentGroup?.content ?? '',
  );
  const [edited, setEdited] = useState(false);
  const lock = useEditLock({
    client: groupLockClient,
    enabled: Boolean(groupId && canEdit && currentGroup?.workspaceId),
    isDirty: edited,
    resourceId: groupId ?? undefined,
  });
  const editable = canEdit && !lock.lockedByOther && !lock.pending && lock.health === 'healthy';
  const { lastSavedAt, save, status } = useSaveState();
  const agentBuilderContentUpdate = useGroupProfileStore((s) => s.agentBuilderContentUpdate);
  const setAgentBuilderContent = useGroupProfileStore((s) => s.setAgentBuilderContent);

  useEffect(() => {
    if (!agentBuilderContentUpdate || agentBuilderContentUpdate.entityId !== groupId) return;
    setDraft((current) => ({ ...current, content: agentBuilderContentUpdate.content }));
    setEdited(true);
    setAgentBuilderContent('', '');
  }, [agentBuilderContentUpdate, groupId, setAgentBuilderContent, setDraft]);

  const saveSettings = () => {
    if (!editable || !groupId || !draft.title.trim() || status === 'saving') return;
    void save(async () => {
      if (currentGroup?.workspaceId) {
        const acquired = await groupLockClient.acquire(groupId);
        if (acquired.lockedByOther) throw new Error('Group is being edited by another member');
      }
      await updateGroup(groupId, {
        content: draft.content,
        // Markdown is now edited directly; do not restore obsolete rich-text JSON.
        editorData: {},
        title: draft.title,
      });
    });
  };

  return (
    <form
      className="flex flex-col gap-6 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        saveSettings();
      }}
    >
      {((hasActiveWorkspace && currentGroup?.visibility !== 'private') ||
        lock.lockedByOther ||
        (canEdit && lock.pending)) && (
        <div className="flex items-center gap-2">
          <AccessLevelTag
            resourceType="agentGroup"
            resourceId={
              hasActiveWorkspace && currentGroup?.visibility !== 'private'
                ? (groupId ?? undefined)
                : undefined
            }
          />
          <EditingIndicator
            holderId={lock.lockedByOther ? lock.holderId : null}
            pending={canEdit && lock.pending}
          />
        </div>
      )}
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('group.create.name', { ns: 'chat' })}
        <Input
          required
          disabled={!editable || status === 'saving'}
          placeholder={t('name.placeholder', { ns: 'agentGroup' })}
          value={draft.title}
          onChange={(event) => {
            setEdited(true);
            setDraft((current) => ({ ...current, title: event.target.value }));
          }}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('group.create.instructions', { ns: 'chat' })}
        <Textarea
          className="min-h-40 font-normal"
          disabled={!editable || status === 'saving'}
          placeholder={t('group.profile.contentPlaceholder', { ns: 'chat' })}
          rows={6}
          value={draft.content}
          onChange={(event) => {
            setEdited(true);
            setDraft((current) => ({ ...current, content: event.target.value }));
          }}
        />
      </label>
      <div className="flex items-center justify-between gap-4">
        <div aria-live="polite" className="flex items-center gap-2">
          {(status === 'saving' || status === 'failed' || (status === 'saved' && !dirty)) && (
            <AutoSaveHint lastUpdatedTime={lastSavedAt} saveStatus={status} />
          )}
          {moreMenuItems.length > 0 && (
            <SidebarDropdownMenu items={moreMenuItems}>
              <ActionIcon
                icon={MoreHorizontalIcon}
                size="small"
                style={{ color: theme.colorTextSecondary }}
              />
            </SidebarDropdownMenu>
          )}
        </div>
        <Button
          loading={status === 'saving'}
          type="submit"
          disabled={
            !editable ||
            !draft.title.trim() ||
            status === 'saving' ||
            (!dirty && status !== 'failed')
          }
        >
          {t(status === 'failed' ? 'retry' : 'save', { ns: 'common' })}
        </Button>
      </div>
    </form>
  );
};

export default GroupProfile;
