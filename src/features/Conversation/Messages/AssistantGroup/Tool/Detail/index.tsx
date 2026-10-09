import { getBuiltinStreaming } from '@orvilo/builtin-tools/streamings';
import {
  type ChatToolResult,
  classifyToolInterventionPresentation,
  type ToolIntervention,
} from '@orvilo/types';
import { safeParseJSON, safeParsePartialJSON } from '@orvilo/utils';
import { CheckIcon } from 'lucide-react';
import { memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import { ToolInput } from '@/components/ai-elements/tool';

import UserInterventionErrorBoundary from '../../../../InterventionBar/UserInterventionErrorBoundary';
import { dataSelectors, useConversationStore } from '../../../../store';
import AbortResponse from './AbortResponse';
import Intervention from './Intervention';
import LoadingPlaceholder from './LoadingPlaceholder';
import RejectedResponse from './RejectedResponse';
import ToolRender from './Render';

interface RenderProps {
  apiName: string;
  arguments?: string;
  disableEditing?: boolean;
  identifier: string;
  intervention?: ToolIntervention;
  isArgumentsStreaming?: boolean;
  isToolCalling?: boolean;
  /**
   * ContentBlock ID (not the group message ID)
   */
  messageId: string;
  result?: ChatToolResult;
  showCustomToolRender?: boolean;
  toolCallId: string;
  toolMessageId?: string;
  type?: string;
}

/**
 * Tool Render for Group Messages
 *
 * In group messages, tool results are already embedded in the payload,
 * so we don't need to query them from the store or handle streaming.
 */
const Render = memo<RenderProps>(
  ({
    toolCallId,
    messageId,
    arguments: requestArgs,
    disableEditing,
    identifier,
    apiName,
    result,
    type,
    intervention,
    toolMessageId,
    isArgumentsStreaming,
    isToolCalling,
    showCustomToolRender,
  }) => {
    const { t } = useTranslation('chat');
    // Use the real display turn owner rather than this content block's id.
    // Parallel approval batching and continuation must use the same anchor as
    // the pending-intervention selector used by the conversation host.
    const assistantGroupId = useConversationStore(
      (s) =>
        dataSelectors.pendingInterventions(s).find((item) => item.toolCallId === toolCallId)
          ?.assistantGroupId,
    );

    if (toolMessageId && intervention?.status === 'pending' && !disableEditing) {
      if (classifyToolInterventionPresentation(identifier, apiName).surface !== 'binary')
        return null;
      return (
        <div className="space-y-4">
          <ToolInput input={safeParseJSON(requestArgs || '') ?? requestArgs ?? {}} />
          <UserInterventionErrorBoundary
            apiName={apiName}
            assistantGroupId={assistantGroupId}
            identifier={identifier}
            key={`${toolCallId}:${requestArgs}`}
            requestArgs={requestArgs || ''}
            toolCallId={toolCallId}
            toolMessageId={toolMessageId}
          >
            <Intervention
              apiName={apiName}
              assistantGroupId={assistantGroupId}
              id={toolMessageId}
              identifier={identifier}
              requestArgs={requestArgs || ''}
              toolCallId={toolCallId}
            />
          </UserInterventionErrorBoundary>
        </div>
      );
    }

    if (intervention?.status === 'rejected') {
      return (
        <RejectedResponse
          apiName={apiName}
          reason={intervention.rejectedReason}
          skipped={intervention.skipped}
          toolCallId={toolCallId}
        />
      );
    }

    if (intervention?.status === 'aborted') {
      return <AbortResponse />;
    }

    // Handle arguments streaming state
    if (isArgumentsStreaming || !result) {
      // Check if there's a custom streaming renderer for this tool
      const StreamingRenderer = getBuiltinStreaming(identifier, apiName);

      if (StreamingRenderer) {
        const args = safeParsePartialJSON(requestArgs);

        return (
          <StreamingRenderer
            apiName={apiName}
            args={args}
            identifier={identifier}
            messageId={messageId}
            toolCallId={toolCallId}
          />
        );
      }

      // No custom streaming renderer, return null
      return null;
    }

    const placeholder = (
      <LoadingPlaceholder
        loading
        apiName={apiName}
        identifier={identifier}
        messageId={messageId}
        requestArgs={requestArgs}
        toolCallId={toolCallId}
      />
    );

    if (isToolCalling) return placeholder;

    return (
      <Suspense fallback={placeholder}>
        <div className="space-y-4">
          {intervention?.status === 'approved' &&
            classifyToolInterventionPresentation(identifier, apiName).surface === 'binary' && (
              <Confirmation
                approval={{ id: toolCallId, approved: true }}
                state="approval-responded"
              >
                <ConfirmationTitle>
                  <ConfirmationAccepted>
                    <span className="flex items-center gap-2">
                      <CheckIcon className="size-4 shrink-0 text-success" />
                      {t('tool.intervention.approved')}
                    </span>
                  </ConfirmationAccepted>
                </ConfirmationTitle>
              </Confirmation>
            )}
          <ToolRender
            content={result.content || ''}
            errorText={result.error?.message || result.error?.type}
            messageId={toolMessageId}
            pluginState={result.state}
            showCustomToolRender={result.error ? false : showCustomToolRender}
            toolCallId={toolCallId}
            plugin={{
              apiName,
              arguments: requestArgs || '',
              identifier,
              type: type as any,
            }}
          />
        </div>
      </Suspense>
    );
  },
);

Render.displayName = 'GroupToolRender';

export default Render;
