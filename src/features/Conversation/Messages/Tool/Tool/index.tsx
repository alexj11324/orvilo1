import { getBuiltinRender } from '@orvilo/builtin-tools/renders';
import { type CSSProperties } from 'react';
import { memo, useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import Actions from '@/features/Conversation/Messages/AssistantGroup/Tool/Actions';
import dynamic from '@/libs/next/dynamic';

import { dataSelectors, messageStateSelectors, useConversationStore } from '../../../store';
import Inspectors from '../../AssistantGroup/Tool/Inspector';

const Debug = dynamic(() => import('../../AssistantGroup/Tool/Debug'), {
  loading: () => <Skeleton style={{ height: 300, width: '100%' }} />,
  ssr: false,
});

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
    const [showDebug, setShowDebug] = useState(false);
    const [showCustomToolRender, setShowCustomToolRender] = useState(true);
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

    const hasCustomRender = !!getBuiltinRender(identifier, apiName);

    return (
      <Accordion
        multiple
        className="gap-2"
        value={expand ? ['tool'] : []}
        onValueChange={(value) => setExpand(value.length > 0)}
      >
        <AccordionItem value="tool">
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <AccordionTrigger
                className="hover:no-underline"
                style={{ paddingBlock: 4, paddingInline: 4 }}
              >
                {
                  <Inspectors
                    apiName={apiName}
                    identifier={identifier}
                    result={result}
                    toolCallId={toolCallId}
                  />
                }
              </AccordionTrigger>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!disableEditing && (
                <Actions
                  assistantMessageId={messageId}
                  canToggleCustomToolRender={hasCustomRender}
                  identifier={identifier}
                  setShowCustomToolRender={setShowCustomToolRender}
                  setShowDebug={setShowDebug}
                  showCustomToolRender={showCustomToolRender}
                  showDebug={showDebug}
                />
              )}
            </div>
          </div>
          <AccordionContent>
            {
              <div className="flex flex-col gap-2 py-2">
                {showDebug && !disableEditing && (
                  <Debug
                    apiName={apiName}
                    identifier={identifier}
                    requestArgs={requestArgs}
                    result={result}
                    toolCallId={toolCallId}
                    type={type}
                  />
                )}
                <Detail
                  apiName={apiName}
                  arguments={requestArgs}
                  disableEditing={disableEditing}
                  identifier={identifier}
                  messageId={messageId}
                  result={result}
                  showCustomToolRender={showCustomToolRender}
                  toolCallId={toolCallId}
                  type={type}
                />
              </div>
            }
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  },
);

Tool.displayName = 'AssistantTool';

export default Tool;
