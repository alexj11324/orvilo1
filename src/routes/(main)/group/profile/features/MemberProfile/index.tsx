'use client';

import isEqual from 'fast-deep-equal';
import { InfoIcon, PlayIcon, PlusIcon } from 'lucide-react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import urlJoin from 'url-join';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditorCanvas } from '@/features/EditorCanvas';
import { usePermission } from '@/hooks/usePermission';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useGroupProfileStore } from '@/store/groupProfile';

import AutoSaveHint from '../Header/AutoSaveHint';
import AgentHeader from './AgentHeader';
import AgentTool from './AgentTool';

const MemberProfile = memo(() => {
  const { t } = useTranslation(['setting', 'chat']);
  const { allowed: canEdit } = usePermission('edit_own_content');

  // Get agentId from profile store (activeTabId is the selected agent ID)
  const agentId = useGroupProfileStore((s) => s.activeTabId);
  const editor = useGroupProfileStore((s) => s.editor);
  const handleContentChange = useGroupProfileStore((s) => s.handleContentChange);
  const agentBuilderContentUpdate = useGroupProfileStore((s) => s.agentBuilderContentUpdate);
  const setAgentBuilderContent = useGroupProfileStore((s) => s.setAgentBuilderContent);

  // Get agent config by agentId
  const config = useAgentStore(agentByIdSelectors.getAgentConfigById(agentId), isEqual);
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);

  const { gid } = useParams<{ gid: string }>();
  const groupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
  const currentGroup = useAgentGroupStore(
    (s) => agentGroupSelectors.getGroupById(gid ?? '')(s),
    isEqual,
  );
  const currentGroupAgents = useAgentGroupStore(
    (s) => agentGroupSelectors.getGroupAgents(gid ?? '')(s),
    isEqual,
  );
  const router = useQueryRoute();

  // Check if the current agent is the supervisor
  const isSupervisor = currentGroup?.supervisorAgentId === agentId;

  // Compute isExternal based on group member properties
  const isExternal = useMemo(() => {
    const agent = currentGroupAgents.find((a) => a.id === agentId);
    return agent ? !agent.isSupervisor && !agent.virtual : false;
  }, [currentGroupAgents, agentId]);

  // Stabilize editorData object reference to prevent unnecessary re-renders
  const editorData = useMemo(
    () => ({
      content: config?.systemRole,
      editorData: config?.editorData,
    }),
    [config?.systemRole, config?.editorData],
  );

  // The prompt canvas only mounts on demand — a member without instructions
  // renders a compact affordance instead of a page-high empty editor.
  const [contentRevealed, setContentRevealed] = useState(false);
  const agentIdRef = useRef(agentId);
  if (agentIdRef.current !== agentId) {
    agentIdRef.current = agentId;
    setContentRevealed(false);
  }

  // Wrap updateAgentConfigById for saving editor content
  const updateContent = useCallback(
    async (payload: { content: string; editorData: Record<string, any> }) => {
      if (!canEdit) return;

      await updateAgentConfigById(agentId, {
        editorData: payload.editorData,
        systemRole: payload.content,
      });
    },
    [canEdit, updateAgentConfigById, agentId],
  );

  // Handle editor content change
  const onContentChange = useCallback(() => {
    if (!canEdit) return;

    handleContentChange(updateContent);
  }, [canEdit, handleContentChange, updateContent]);

  // Watch for agent builder content updates and apply them directly to the editor
  useEffect(() => {
    if (!editor || !agentBuilderContentUpdate) return;
    if (agentBuilderContentUpdate.entityId !== agentId) return;

    // The builder is writing the prompt — surface the canvas for it.
    setContentRevealed(true);
    // Directly set the editor content
    editor.setDocument('markdown', agentBuilderContentUpdate.content);

    // Clear the update after processing to prevent re-applying
    setAgentBuilderContent('', '');
  }, [editor, agentBuilderContentUpdate, agentId, setAgentBuilderContent]);

  return (
    <>
      {/* External agent warning or AutoSaveHint */}
      <div className="flex flex-col" style={{ height: 66, width: '100%' }}>
        {isExternal && !isSupervisor && (
          <Alert style={{ width: '100%' }} variant="info">
            <InfoIcon />
            <AlertTitle>{t('group.profile.externalAgentWarning', { ns: 'chat' })}</AlertTitle>
          </Alert>
        )}
        <div className="flex flex-col py-3">
          <AutoSaveHint />
        </div>
      </div>
      <div
        className="flex flex-col"
        style={{ cursor: 'default', marginBottom: 12 }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Header: Avatar + Name */}
        <AgentHeader disabled={!canEdit} readOnly={isSupervisor} />
        <AgentTool />
        <div className="flex items-center gap-2 justify-start" style={{ marginTop: 16 }}>
          <Button
            disabled={!canEdit}
            onClick={() => {
              if (!groupId) return;
              router.push(urlJoin('/group', groupId));
            }}
          >
            <PlayIcon data-icon="inline-start" />
            {t('startConversation')}
          </Button>
        </div>
      </div>
      <Separator />
      {/* Main Content: Prompt Editor — hidden until the member actually has
          instructions or the user asks for them, so the column never renders a
          large empty editor. */}
      {config?.systemRole?.trim() || contentRevealed ? (
        <EditorCanvas
          disabled={!canEdit}
          editor={editor}
          editorData={editorData}
          entityId={agentId}
          placeholder={
            isSupervisor
              ? t('group.profile.supervisorPlaceholder', { ns: 'chat' })
              : t('settingAgent.prompt.placeholder')
          }
          onContentChange={onContentChange}
        />
      ) : canEdit ? (
        <Button
          className="w-full justify-start"
          style={{ borderStyle: 'dashed' }}
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

export default MemberProfile;
