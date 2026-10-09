import { getBuiltinStreaming } from '@orvilo/builtin-tools/streamings';
import { LOADING_FLAT } from '@orvilo/const';
import isEqual from 'fast-deep-equal';
import { CircleStopIcon, CornerUpRightIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Tool as ToolShell, ToolContent, ToolHeader } from '@/components/ai-elements/tool';
import SafeBoundary from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import dynamic from '@/libs/next/dynamic';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/slices/operation/selectors';
import { useToolStore } from '@/store/tool';
import { toolSelectors } from '@/store/tool/selectors';

import { dataSelectors, useConversationStore } from '../../../store';
import { getToolDisplayName } from '../toolDisplayNames';

const Detail = dynamic(() => import('./Detail'), {
  loading: () => <Skeleton style={{ height: 120, width: '100%' }} />,
  ssr: false,
});

export interface GroupToolProps {
  assistantMessageId: string;
  disableEditing?: boolean;
  id: string;
}

const Tool = memo<GroupToolProps>(({ assistantMessageId, disableEditing, id }) => {
  const { t } = useTranslation('plugin');
  // Subscribe directly to this tool's data so a streaming chunk that only
  // updates a sibling tool does not push new props through this subtree.
  const tool = useConversationStore(dataSelectors.getToolInBlock(assistantMessageId, id), isEqual);

  // Stable defaults so downstream hook ordering is preserved even on the brief
  // window where the tool is not yet present in the store snapshot.
  const apiName = tool?.apiName ?? '';
  const identifier = tool?.identifier ?? '';
  const requestArgs = tool?.arguments;
  const intervention = tool?.intervention;
  const result = tool?.result;
  const type = tool?.type;
  const toolMessageId = tool?.result_msg_id;

  // Get renderDisplayControl from manifest. `result.state` lets an API whose
  // output shape varies by target refine it — CC `Read` expands once the result
  // turns out to be an image, and stays collapsed for source text.
  const renderDisplayControl = useToolStore(
    toolSelectors.getRenderDisplayControl(identifier, apiName, result?.state),
  );
  const [showToolRender, setShowToolRender] = useState(false);

  const isPending = intervention?.status === 'pending';
  const isReject = intervention?.status === 'rejected';
  const isAbort = intervention?.status === 'aborted';
  const needExpand = renderDisplayControl !== 'collapsed' || isPending;
  const isAlwaysExpand = renderDisplayControl === 'alwaysExpand';

  let isArgumentsStreaming = false;
  try {
    JSON.parse(requestArgs || '{}');
  } catch {
    isArgumentsStreaming = true;
  }

  const hasStreamingRenderer = !!getBuiltinStreaming(identifier, apiName);
  const forceShowStreamingRender = isArgumentsStreaming && hasStreamingRenderer;

  // Get precise tool calling state from operation
  const isToolCallingFromOperation = useChatStore(
    operationSelectors.isMessageInToolCalling(assistantMessageId),
  );

  // Only treat "missing/placeholder result" as in-flight while this assistant
  // message still has a running operation. After the run ends, tools may
  // legitimately have no merged `result` — do not keep showing "executing".
  const isAssistantMessageBusy = useChatStore(
    operationSelectors.isMessageProcessing(assistantMessageId),
  );

  const hasError = !!result?.error;
  // This tool's own result is the source of truth for completion. The
  // message-level toolCalling flag stays true while sibling tools are still
  // running, so without this guard a finished tool flips back into "loading".
  const hasFinishedResult =
    hasError || (!!result && result.content !== LOADING_FLAT && !!result.content);
  const looksLikeWaitingForToolResult = !hasError && !isArgumentsStreaming && !hasFinishedResult;
  const isToolCallingFallback = looksLikeWaitingForToolResult && isAssistantMessageBusy;
  const isToolCalling = !hasFinishedResult && (isToolCallingFromOperation || isToolCallingFallback);

  // Handle expand state changes
  const handleExpand = (expand?: boolean) => {
    // Block collapse action when alwaysExpand is set
    if (isAlwaysExpand && expand === false) {
      return;
    }
    setShowToolRender(!!expand);
  };

  useEffect(() => {
    if (needExpand) {
      const timer = setTimeout(() => setShowToolRender(true), 100);
      return () => clearTimeout(timer);
    }
  }, [needExpand]);

  if (!tool) return null;

  const isToolDetailExpand = forceShowStreamingRender || showToolRender;

  return (
    <ToolShell className="mb-0" open={isToolDetailExpand} onOpenChange={handleExpand}>
      <ToolHeader
        hideChevron={isAlwaysExpand}
        toolName={apiName}
        type="dynamic-tool"
        state={
          isPending
            ? 'approval-requested'
            : isReject || isAbort
              ? 'output-denied'
              : hasError
                ? 'output-error'
                : isArgumentsStreaming
                  ? 'input-streaming'
                  : isToolCalling
                    ? 'input-available'
                    : 'output-available'
        }
        statusIcon={
          intervention?.status === 'aborted' ? (
            <CircleStopIcon className="size-4 text-muted-foreground" />
          ) : intervention?.skipped ? (
            <CornerUpRightIcon className="size-4 text-muted-foreground" />
          ) : undefined
        }
        statusLabel={
          intervention?.status === 'aborted'
            ? t('components.aiElements.tool.stopped', { ns: 'chat' })
            : intervention?.skipped
              ? t('components.aiElements.tool.skipped', { ns: 'chat' })
              : undefined
        }
        title={t(`builtins.${identifier}.apiName.${apiName}`, {
          defaultValue: getToolDisplayName(apiName),
        })}
      />
      <ToolContent className="pt-0">
        {
          <div className="flex flex-col gap-2 py-2">
            <SafeBoundary alertTitle={`${identifier} / ${apiName}`} variant="alert">
              <Detail
                showCustomToolRender
                apiName={apiName}
                arguments={requestArgs}
                disableEditing={disableEditing}
                identifier={identifier}
                intervention={intervention}
                isArgumentsStreaming={isArgumentsStreaming}
                isToolCalling={isToolCalling}
                messageId={assistantMessageId}
                result={result}
                toolCallId={id}
                toolMessageId={toolMessageId}
                type={type}
              />
            </SafeBoundary>
          </div>
        }
      </ToolContent>
    </ToolShell>
  );
});

Tool.displayName = 'GroupTool';

export default Tool;
