import { CircleStopIcon, CornerUpRightIcon } from 'lucide-react';
import { type CSSProperties } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Tool as ToolShell, ToolContent, ToolHeader } from '@/components/ai-elements/tool';
import { Skeleton } from '@/components/ui/skeleton';
import dynamic from '@/libs/next/dynamic';

import { dataSelectors, messageStateSelectors, useConversationStore } from '../../../store';
import { getToolDisplayName } from '../../AssistantGroup/toolDisplayNames';

const Detail = dynamic(() => import('../../AssistantGroup/Tool/Detail'), {
  loading: () => <Skeleton style={{ height: 120, width: '100%' }} />,
  ssr: false,
});

export interface InspectorProps {
  apiName: string;
  arguments?: string;
  disableEditing?: boolean;
  identifier: string;
  index: number;
  messageId: string;
  style?: CSSProperties;
  toolCallId: string;
  type?: string;
}

/**
 * Tool message component - adapts Tool message data to use AssistantGroup/Tool components
 */
const Tool = memo<InspectorProps>(
  ({
    arguments: requestArgs,
    apiName,
    disableEditing,
    messageId,
    toolCallId,
    index,
    identifier,
    type,
  }) => {
    const { t } = useTranslation('plugin');
    const [expand, setExpand] = useState(true);

    // Fetch tool message from store
    const toolMessage = useConversationStore(dataSelectors.getDbMessageByToolCallId(toolCallId));

    // Check if tool is still loading
    const loading = useConversationStore(
      messageStateSelectors.isToolCallStreaming(messageId, index),
    );

    // Adapt tool message data to AssistantGroup/Tool format
    const result = toolMessage
      ? {
          content: toolMessage.content,
          error: toolMessage.error,
          id: toolCallId,
          state: toolMessage.pluginState,
        }
      : undefined;

    // Don't render if still loading and no message yet
    if (loading && !toolMessage) return null;

    return (
      <ToolShell open={expand} onOpenChange={setExpand}>
        <ToolHeader
          toolName={apiName}
          type="dynamic-tool"
          state={
            toolMessage?.pluginIntervention?.status === 'pending'
              ? 'approval-requested'
              : toolMessage?.pluginIntervention?.status === 'rejected' ||
                  toolMessage?.pluginIntervention?.status === 'aborted'
                ? 'output-denied'
                : result?.error
                  ? 'output-error'
                  : loading
                    ? 'input-available'
                    : 'output-available'
          }
          statusIcon={
            toolMessage?.pluginIntervention?.status === 'aborted' ? (
              <CircleStopIcon className="size-4 text-muted-foreground" />
            ) : toolMessage?.pluginIntervention?.skipped ? (
              <CornerUpRightIcon className="size-4 text-muted-foreground" />
            ) : undefined
          }
          statusLabel={
            toolMessage?.pluginIntervention?.status === 'aborted'
              ? t('components.aiElements.tool.stopped', { ns: 'chat' })
              : toolMessage?.pluginIntervention?.skipped
                ? t('components.aiElements.tool.skipped', { ns: 'chat' })
                : undefined
          }
          title={t(`builtins.${identifier}.apiName.${apiName}`, {
            defaultValue: getToolDisplayName(apiName),
          })}
        />
        <ToolContent>
          {
            <div className="flex flex-col gap-2 py-2">
              <Detail
                showCustomToolRender
                apiName={apiName}
                arguments={requestArgs}
                disableEditing={disableEditing}
                identifier={identifier}
                intervention={toolMessage?.pluginIntervention}
                messageId={messageId}
                result={result}
                toolCallId={toolCallId}
                toolMessageId={toolMessage?.id ?? messageId}
                type={type}
              />
            </div>
          }
        </ToolContent>
      </ToolShell>
    );
  },
);

Tool.displayName = 'AssistantTool';

export default Tool;
