'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EditingIndicator, type EditLockClient, useEditLock } from '@/features/EditLock';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
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
  const { t } = useTranslation(['chat', 'common']);
  const { allowed: hasEditPermission } = usePermission('edit_own_content');
  const { gid } = useParams<{ gid: string }>();
  const groupId = gid;
  const currentGroup = useAgentGroupStore((s) => agentGroupSelectors.getGroupById(gid ?? '')(s));
  const updateGroup = useAgentGroupStore((s) => s.updateGroup);
  // A workspace member whose General access on this group is view/use level
  // can't edit it (defaults permissive while loading — server enforces).
  const { canEditResource } = useResourceAccess(
    'agentGroup',
    currentGroup?.visibility === 'private' ? undefined : (groupId ?? undefined),
  );
  const canEdit = hasEditPermission && canEditResource;

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
    if (!editable || !groupId || status === 'saving') return;
    void save(async () => {
      if (currentGroup?.workspaceId) {
        const acquired = await groupLockClient.acquire(groupId);
        if (acquired.lockedByOther) throw new Error('Group is being edited by another member');
      }
      await updateGroup(groupId, {
        content: draft.content,
        // Markdown is now edited directly; do not restore obsolete rich-text JSON.
        editorData: {},
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
      {(lock.lockedByOther || (canEdit && lock.pending)) && (
        <div className="flex items-center gap-2">
          <EditingIndicator
            holderId={lock.lockedByOther ? lock.holderId : null}
            pending={canEdit && lock.pending}
          />
        </div>
      )}
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('group.settings.description', { ns: 'chat' })}
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
        </div>
        <Button
          disabled={!editable || status === 'saving' || (!dirty && status !== 'failed')}
          loading={status === 'saving'}
          type="submit"
        >
          {t(status === 'failed' ? 'retry' : 'save', { ns: 'common' })}
        </Button>
      </div>
    </form>
  );
};

export default GroupProfile;
