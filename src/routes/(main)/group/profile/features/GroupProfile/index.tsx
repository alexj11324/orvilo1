'use client';

import { useTheme } from 'antd-style';
import { MoreHorizontalIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import urlJoin from 'url-join';

import { useAgentGroupTransferMenuItem } from '@/business/client/hooks/useAgentGroupTransferMenuItem';
import { useAgentGroupTransferToMemberMenuItem } from '@/business/client/hooks/useAgentGroupTransferToMemberMenuItem';
import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditingIndicator, type EditLockClient, useEditLock } from '@/features/EditLock';
import { EditorCanvas } from '@/features/EditorCanvas';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import AccessLevelTag from '@/features/ResourcePermission/AccessLevelTag';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useGroupProfileStore } from '@/store/groupProfile';

import AutoSaveHint from '../Header/AutoSaveHint';
import GroupHeader from './GroupHeader';

// Stable lock RPC binding for the chatGroup resource.
const groupLockClient: EditLockClient = {
  acquire: (id) => lambdaClient.group.acquireGroupLock.mutate({ id }),
  peek: (id) => lambdaClient.group.getGroupLock.query({ id }),
  release: async (id) => {
    await lambdaClient.group.releaseGroupLock.mutate({ id });
  },
};

const GroupProfile = memo(() => {
  const { t } = useTranslation(['setting', 'chat']);
  const { allowed: hasEditPermission } = usePermission('edit_own_content');
  const theme = useTheme();
  const { gid } = useParams<{ gid: string }>();
  const groupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
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

  // Collaborative edit lock for workspace groups (same model as pages): read-only
  // when another member is editing; acquired implicitly on the first edit.
  const [edited, setEdited] = useState(false);
  const groupIdRef = useRef(groupId);
  // The description canvas only mounts on demand — a fresh group renders a
  // compact affordance instead of a page-high empty editor.
  const [contentRevealed, setContentRevealed] = useState(false);
  if (groupIdRef.current !== groupId) {
    groupIdRef.current = groupId;
    setEdited(false);
    setContentRevealed(false);
  }
  const lock = useEditLock({
    client: groupLockClient,
    // Only workspace groups lock — personal (non-workspace) groups stay fully
    // editable with no peek/pending, matching the server's workspace gating.
    enabled: Boolean(groupId && canEdit && currentGroup?.workspaceId),
    isDirty: edited,
    resourceId: groupId ?? undefined,
  });
  // Read-only until the lock resolves, so the user can't start typing on a group
  // that turns out to be locked and get bounced mid-edit.
  const editable = canEdit && !lock.lockedByOther && !lock.pending;

  const editor = useGroupProfileStore((s) => s.editor);
  const handleContentChange = useGroupProfileStore((s) => s.handleContentChange);
  const agentBuilderContentUpdate = useGroupProfileStore((s) => s.agentBuilderContentUpdate);
  const setAgentBuilderContent = useGroupProfileStore((s) => s.setAgentBuilderContent);

  // Create save callback that captures latest groupId
  const saveContent = useCallback(
    async (payload: { content: string; editorData: Record<string, any> }) => {
      if (!canEdit) return;
      if (!groupId) return;
      await updateGroup(groupId, {
        content: payload.content,
        editorData: payload.editorData,
      });
    },
    [canEdit, updateGroup, groupId],
  );

  const onContentChange = useCallback(() => {
    if (!editable) return;

    setEdited(true);
    handleContentChange(saveContent);
  }, [editable, handleContentChange, saveContent]);

  // Stabilize editorData object reference to prevent unnecessary re-renders
  const editorData = useMemo(
    () => ({
      content: currentGroup?.content ?? undefined,
      editorData: currentGroup?.editorData,
    }),
    [currentGroup?.content, currentGroup?.editorData],
  );

  // Watch for agent builder content updates and apply them directly to the editor
  useEffect(() => {
    if (!editor || !agentBuilderContentUpdate || !groupId) return;
    if (agentBuilderContentUpdate.entityId !== groupId) return;

    // The builder is writing the description — surface the canvas for it.
    setContentRevealed(true);
    // Directly set the editor content
    editor.setDocument('markdown', agentBuilderContentUpdate.content);

    // Clear the update after processing to prevent re-applying
    setAgentBuilderContent('', '');
  }, [editor, agentBuilderContentUpdate, groupId, setAgentBuilderContent]);

  return (
    <>
      <div
        className="flex flex-col"
        style={{ cursor: 'default', marginBottom: 12 }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex flex-col" style={{ height: 66, width: '100%' }}>
          <div className="flex items-center gap-2 py-3">
            <AutoSaveHint />
            <AccessLevelTag
              resourceType={'agentGroup'}
              resourceId={
                hasActiveWorkspace && currentGroup?.visibility !== 'private'
                  ? (groupId ?? undefined)
                  : undefined
              }
            />
          </div>
        </div>
        {/* Header: Group Avatar + Title */}
        <GroupHeader />
        <div className="flex items-center gap-2 justify-start" style={{ marginTop: 16 }}>
          {moreMenuItems.length > 0 && (
            <SidebarDropdownMenu items={moreMenuItems}>
              <ActionIcon
                icon={MoreHorizontalIcon}
                size={'small'}
                style={{ color: theme.colorTextSecondary }}
              />
            </SidebarDropdownMenu>
          )}
        </div>
      </div>
      <Separator />
      {/* Group Content Editor — hidden until the group actually has a
          description or the user asks for one, so the column never renders a
          large empty editor. */}
      <EditingIndicator
        holderId={lock.lockedByOther ? lock.holderId : null}
        pending={canEdit && lock.pending}
      />
      {currentGroup?.content?.trim() || contentRevealed ? (
        <EditorCanvas
          disabled={!canEdit}
          editable={!lock.lockedByOther && !lock.pending}
          editor={editor}
          editorData={editorData}
          entityId={groupId}
          placeholder={t('group.profile.contentPlaceholder', { ns: 'chat' })}
          onContentChange={onContentChange}
        />
      ) : canEdit ? (
        <Button
          className="w-full justify-start"
          style={{ borderStyle: 'dashed', color: theme.colorTextSecondary }}
          variant="outline"
          onClick={() => setContentRevealed(true)}
        >
          <PlusIcon data-icon="inline-start" />
          {t('group.profile.addInstructions', { ns: 'chat' })}
        </Button>
      ) : null}
    </>
  );
});

export default GroupProfile;
