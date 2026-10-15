'use client';

import { HETEROGENEOUS_TYPE_LABELS } from '@orvilo/heterogeneous-agents';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useUploadFiles } from '@/components/DragUploadZone';
import type { NativeMathRenderer } from '@/components/NativePageEditor/math';
import { usePermission } from '@/hooks/usePermission';
import { getHostPort, hasHostCapability } from '@/platform';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useAgentId } from '../hooks/useAgentId';
import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { useEffectiveModel } from '../hooks/useEffectiveModel';
import Placeholder, { type PlaceholderVariant } from '../InputEditor/Placeholder';
import { useMentionCategories } from '../InputEditor/useMentionCategories';
import { useChatInputStore, useStoreApi } from '../store';
import { bindNativeComposer } from './bindNativeComposer';
import { NativeCompleteChatInputEditor } from './CompleteChatInputEditor';
import type { NativeChatInputEditorProps } from './NativeChatInputEditor';

export interface StoreBoundNativeChatInputEditorProps {
  defaultRows?: number;
  initialContent?: string;
  mathRenderer: NativeMathRenderer;
  placeholder?: NativeChatInputEditorProps['placeholder'];
  placeholderVariant?: PlaceholderVariant;
}

/** Actual shared store transaction: same Conversation onSend, attachment/context
 * snapshots and rejected-send restoration, with an explicitly native backend. */
export function StoreBoundNativeChatInputEditor(props: StoreBoundNativeChatInputEditorProps) {
  const api = useStoreApi();
  const { t } = useTranslation('chat');
  const state = useChatInputStore((s) => ({
    draftKey: s.draftKey,
    expand: s.expand,
    feature: s.feature,
    saved: s._savedEditorState,
    popup: s.slashMenuRef.current,
  }));
  const { allowed } = usePermission('create_content');
  const { canUseResource } = useChatInputResourceAccess();
  const agentId = useAgentId();
  const mobile = useServerConfigStore((s) => s.isMobile);
  const heterogeneousType = useAgentStore(
    (s) => agentByIdSelectors.getAgencyConfigById(agentId)(s)?.heterogeneousProvider?.type,
  );
  const heterogeneousName = heterogeneousType
    ? (HETEROGENEOUS_TYPE_LABELS[heterogeneousType] ?? heterogeneousType)
    : undefined;
  const categories = useMentionCategories();
  const showAgentAssignmentHint =
    (state.feature?.mention ?? true) &&
    !heterogeneousName &&
    categories.some((category) => category.id === 'agent');
  const userId = useUserStore(userProfileSelectors.userId);
  const { model, provider } = useEffectiveModel(agentId);
  const { handleUploadFiles } = useUploadFiles({ agentId, model, provider });
  const bindEditor = useCallback<NativeChatInputEditorProps['bindEditor']>(
    (editor) => bindNativeComposer(api, editor),
    [api],
  );
  const resolveSendBlocked = () => {
    const live = api.getState();
    return (
      !allowed ||
      !canUseResource ||
      (live.resolveSendBlocked
        ? live.resolveSendBlocked()
        : Boolean(live.sendButtonProps?.disabled))
    );
  };
  // No invented fallback conversation key: durable writes must target the real
  // current context. Callers without a draft key keep the legacy host until their
  // actual context owner supplies it.
  if (!state.draftKey) throw new Error('Native chat requires the real conversation draftKey');
  return (
    <NativeCompleteChatInputEditor
      bindEditor={bindEditor}
      className={mobile ? '[&_.native-editor-content]:text-base' : undefined}
      draftKey={state.draftKey}
      editable={allowed && canUseResource}
      expanded={Boolean(state.expand)}
      historyEnabled={state.feature?.inputHistory ?? true}
      historyScope={{ agentId, userId }}
      initialContent={props.initialContent}
      label={t('sendPlaceholder')}
      mathRenderer={props.mathRenderer}
      mentionEnabled={state.feature?.mention ?? true}
      popupContainer={state.popup}
      resolveSendBlocked={resolveSendBlocked}
      savedEditorData={state.saved}
      slashEnabled={state.feature?.slash ?? true}
      style={{ minHeight: `${Math.max(1, props.defaultRows ?? 2) * 1.375}rem` }}
      uploadFiles={handleUploadFiles}
      placeholder={
        props.placeholder ?? (
          <Placeholder
            heterogeneousName={heterogeneousName}
            showAgentAssignmentHint={showAgentAssignmentHint}
            variant={props.placeholderVariant}
          />
        )
      }
      onMarkdownChange={() => api.getState().updateMarkdownContent()}
      onSend={() => api.getState().handleSendButton()}
      onStop={() => api.getState().handleStop()}
      onContextMenu={async (event, editor) => {
        if (!hasHostCapability('menu.native')) return;
        event.preventDefault();
        const selection = editor.getSelectionDocument('markdown');
        await getHostPort().menu.showContextMenu('editor', {
          selectionText: typeof selection === 'string' && selection ? selection : undefined,
        });
      }}
    />
  );
}
