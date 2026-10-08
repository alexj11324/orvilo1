'use client';

import type { NativeInterventionReference, NotificationAgent } from '@orvilo/types';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Spinner } from '@/components/ui/spinner';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { ConversationProvider } from '@/features/Conversation/ConversationProvider';
import Intervention from '@/features/Conversation/Messages/AssistantGroup/Tool/Detail/Intervention';
import ToolRender from '@/features/Conversation/Messages/AssistantGroup/Tool/Detail/Render';
import { dataSelectors, useConversationStore } from '@/features/Conversation/store';
import { useGatewayReconnect } from '@/hooks/useGatewayReconnect';
import { useOperationState } from '@/hooks/useOperationState';
import { useChatStore } from '@/store/chat';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { useTaskStore } from '@/store/task';

const NativeQuestionBody = ({ reference }: { reference: NativeInterventionReference }) => {
  const { t } = useTranslation('notification');
  const context = useConversationStore((s) => s.context);
  const useFetchMessages = useConversationStore((s) => s.useFetchMessages);
  const message = useConversationStore((s) =>
    dataSelectors.getDbMessageById(reference.messageId)(s),
  );
  const { error, isLoading, mutate } = useFetchMessages(context);
  if (error) return <AsyncError error={error} onRetry={() => void mutate()} />;
  if (!message && isLoading) return <Spinner />;
  if (!message?.plugin || message.tool_call_id !== reference.toolCallId) {
    return <p role="alert">{t('inbox.question.unavailable')}</p>;
  }
  if (message.pluginIntervention?.status === 'pending') {
    return (
      <Intervention
        apiName={message.plugin.apiName}
        id={message.id}
        identifier={message.plugin.identifier}
        requestArgs={message.plugin.arguments || ''}
        toolCallId={reference.toolCallId}
      />
    );
  }
  return (
    <ToolRender
      showCustomToolRender
      content={message.content}
      messageId={message.id}
      plugin={message.plugin}
      pluginState={message.pluginState}
      toolCallId={reference.toolCallId}
    />
  );
};

/** The original question renderer and operation context, mounted beside the Issue content. */
export const InboxNativeIntervention = ({
  agent,
  reference,
  taskId,
}: {
  agent?: NotificationAgent;
  reference: NativeInterventionReference;
  taskId: string;
}) => {
  const context = useMemo(
    () => ({
      agentId: reference.agentId,
      isolatedTopic: true,
      scope: 'main' as const,
      threadId: reference.threadId,
      topicId: reference.topicId,
    }),
    [reference.agentId, reference.threadId, reference.topicId],
  );
  const messages = useChatStore((s) => s.dbMessagesMap[messageMapKey(context)]);
  const replaceMessages = useChatStore((s) => s.replaceMessages);
  const operationState = useOperationState(context);
  const runningOperation = useTaskStore(
    (s) =>
      s.taskDetailMap[taskId]?.activities?.find((activity) => activity.id === reference.topicId)
        ?.runningOperation,
  );
  useGatewayReconnect(reference.topicId, runningOperation, reference.agentId);

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-3"
      data-native-question={reference.messageId}
    >
      <div className="flex items-center gap-2">
        <AssigneeAvatar agentId={reference.agentId} size={24} />
        <span className="text-sm font-medium">{agent?.name}</span>
      </div>
      <ConversationProvider
        context={context}
        hasInitMessages={!!messages}
        messages={messages}
        operationState={operationState}
        onMessagesChange={(msgs, ctx, meta) =>
          replaceMessages(msgs, { context: ctx, source: meta?.source })
        }
      >
        <NativeQuestionBody reference={reference} />
      </ConversationProvider>
    </div>
  );
};
