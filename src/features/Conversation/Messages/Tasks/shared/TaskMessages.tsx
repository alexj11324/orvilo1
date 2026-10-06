'use client';
import {Markdown} from '@lobehub/ui';
import { type AssistantContentBlock, type UIChatMessage } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { ScrollText, Workflow } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import ContentBlock from '../../AssistantGroup/components/ContentBlock';
import ContentBlocksScroll from '../../AssistantGroup/components/ContentBlocksScroll';
import { resolveAssistantGroupFromMessages } from '../../AssistantGroup/utils/resolveAssistantGroupFromMessages';
import Usage from '../../components/Extras/Usage';
import AnimatedNumber from '../../components/Extras/Usage/UsageDetail/AnimatedNumber';
import { accumulateUsage, formatDuration, formatElapsedTime } from './utils';

const styles = createStaticStyles(({ css }) => ({
  instructionContent: css`
    overflow: auto;
    max-height: 300px;
  `,
}));

/**
 * InstructionAccordion - Shows the task instruction in a collapsible accordion
 */
const InstructionAccordion = memo<{ childrenCount: number; instruction: string }>(
  ({ instruction, childrenCount }) => {
    const { t } = useTranslation('chat');

    // Auto-collapse instruction when children count exceeds threshold
    const [expandedKeys, setExpandedKeys] = useState<string[]>(['instruction']);

    useEffect(() => {
      if (childrenCount > 1) {
        setExpandedKeys([]);
      }
    }, [childrenCount > 1]);

    return (
      <Accordion multiple className='gap-2' value={expandedKeys} onValueChange={setExpandedKeys}><AccordionItem value='instruction'><AccordionTrigger className="hover:no-underline" style={{ paddingBlock: 4, paddingInline: 4 }}>{(
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 justify-center" style={{flex: "none", height: 24, border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG, width: 24,  fontSize: 12 }}
                >
                  <ScrollText color={cssVar.colorTextSecondary} />
                </div>
                <span className='text-muted-foreground'>
                  {t('task.instruction')}
                </span>
              </div>
            )}</AccordionTrigger><AccordionContent>{(
              <div className={cn('flex flex-col p-3', styles.instructionContent)} style={{border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG,  marginBlock: 8 }}
              >
                <Markdown variant={'chat'}>{instruction}</Markdown>
              </div>
            )}</AccordionContent></AccordionItem></Accordion>
    );
  },
);

InstructionAccordion.displayName = 'InstructionAccordion';

interface TaskMessagesProps {
  /**
   * Task duration in ms (for completed state)
   */
  duration?: number;
  /**
   * Whether the task is currently processing
   */
  isProcessing?: boolean;
  /**
   * Messages from task execution (parsed by conversation-flow)
   * Will extract assistantGroup.children as blocks for rendering
   */
  messages: UIChatMessage[];
  /**
   * Model name for usage display
   */
  model?: string;
  /**
   * Provider name for usage display
   */
  provider?: string;
  /**
   * Task start time for elapsed time calculation
   */
  startTime?: number;
  /**
   * Total cost (for completed state)
   */
  totalCost?: number;
}

/**
 * Processing state - shows all blocks with loading indicator
 */
const ProcessingView = memo<{
  accumulatedUsage: { cost?: number; totalTokens?: number };
  messages: UIChatMessage[];
  model?: string;
  provider?: string;
  startTime?: number;
  totalToolCalls: number;
}>(({ messages, startTime, model, provider, totalToolCalls, accumulatedUsage }) => {
  const { t } = useTranslation('chat');
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
  const [elapsedTime, setElapsedTime] = useState(0);
  const { ref, handleScroll } = useAutoScroll<HTMLDivElement>({
    deps: [messages],
    enabled: true,
  });

  // Calculate initial elapsed time
  useEffect(() => {
    if (startTime) {
      setElapsedTime(Math.max(0, Date.now() - startTime));
    }
  }, [startTime]);

  // Timer for updating elapsed time every second
  useEffect(() => {
    if (!startTime) return;

    const timer = setInterval(() => {
      setElapsedTime(Math.max(0, Date.now() - startTime));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <div className="flex items-center gap-1 justify-center" style={{flex: "none", height: 24, border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG, width: 24,  fontSize: 12 }}
        >
          <NeuralNetworkLoading size={16} />
        </div>
        <div className="flex items-center gap-1">
          <span className='text-muted-foreground font-medium'>
            <AnimatedNumber
              duration={500}
              formatter={(v) => Math.round(v).toString()}
              value={totalToolCalls}
            />
          </span>
          <span className='text-muted-foreground'>
            {t('task.metrics.toolCallsShort')}
          </span>
          {startTime && (
            <span className='text-muted-foreground'>
              ({formatElapsedTime(elapsedTime)})
            </span>
          )}
        </div>
      </div>
      <ContentBlocksScroll
        disableEditing
        messages={messages}
        scrollRef={ref}
        variant="task"
        onScroll={handleScroll}
      />

      {/* Usage display */}
      {isDevMode && model && provider && (
        <Usage model={model} provider={provider} usage={accumulatedUsage} />
      )}
    </div>
  );
});

ProcessingView.displayName = 'ProcessingView';

/**
 * Completed state - shows intermediate steps in accordion, final result visible
 */
const CompletedView = memo<{
  assistantId: string;
  blocks: AssistantContentBlock[];
  duration?: number;
  model?: string;
  provider?: string;
  totalCost?: number;
  totalTokens?: number;
  totalToolCalls: number;
}>(({ blocks, assistantId, duration, totalToolCalls, model, provider, totalTokens, totalCost }) => {
  const { t } = useTranslation('chat');
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);

  // Split blocks: intermediate steps (all but last) and final result (last)
  const { intermediateBlocks, finalBlock } = useMemo(() => {
    if (blocks.length === 0) return { finalBlock: null, intermediateBlocks: [] };
    if (blocks.length === 1) return { finalBlock: blocks[0], intermediateBlocks: [] };

    return {
      finalBlock: blocks.at(-1)!,
      intermediateBlocks: blocks.slice(0, -1),
    };
  }, [blocks]);

  if (!finalBlock) return null;

  const title = (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 justify-center" style={{flex: "none", height: 24, border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG, width: 24,  fontSize: 12 }}
      >
        <Workflow color={cssVar.colorTextSecondary} />
      </div>
      <div className="flex items-center gap-1">
        <span className='text-muted-foreground font-medium'>
          {totalToolCalls}
        </span>
        <span className='text-muted-foreground'>
          {t('task.metrics.toolCallsShort')}
        </span>
        {/* Duration display */}
        {duration && (
          <span className='text-muted-foreground'>
            {t('task.metrics.duration', { duration: formatDuration(duration) })}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Intermediate steps - collapsed by default */}
      {intermediateBlocks.length > 0 && (
        <Accordion multiple className='gap-2' defaultValue={[]}><AccordionItem value='intermediate'><AccordionTrigger className="hover:no-underline" style={{ paddingBlock: 4, paddingInline: 4 }}>{title}</AccordionTrigger><AccordionContent>{(
                <div className="flex flex-col gap-2 px-1" style={{ marginTop: 8 }}>
                  {intermediateBlocks.map((block) => (
                    <ContentBlock
                      {...block}
                      disableEditing
                      assistantId={assistantId}
                      key={block.id}
                    />
                  ))}
                </div>
              )}</AccordionContent></AccordionItem></Accordion>
      )}

      {/* Final result - always visible */}
      <ContentBlock {...finalBlock} disableEditing assistantId={assistantId} />

      {/* Usage display */}
      {isDevMode && model && provider && (
        <Usage model={model} provider={provider} usage={{ cost: totalCost, totalTokens }} />
      )}
    </div>
  );
});

CompletedView.displayName = 'CompletedView';

/**
 * TaskMessages - Renders task execution messages (blocks) for both processing and completed states
 *
 * Extracts assistantGroup.children (blocks) from messages and renders them:
 * - Processing: Shows all blocks with loading indicator and real-time updates
 * - Completed: Shows intermediate steps in accordion, final result always visible
 */
const TaskMessages = memo<TaskMessagesProps>(
  ({ messages, isProcessing = false, startTime, duration, model, provider, totalCost }) => {
    // Extract blocks and instruction from messages
    const { blocks, assistantId, instruction } = useMemo(
      () => resolveAssistantGroupFromMessages(messages),
      [messages],
    );

    // Calculate total tool calls
    const totalToolCalls = useMemo(
      () => blocks.reduce((sum, block) => sum + (block.tools?.length || 0), 0),
      [blocks],
    );

    // Accumulate usage from all blocks
    const accumulatedUsage = useMemo(() => accumulateUsage(blocks), [blocks]);

    return (
      <div className="flex flex-col gap-1">
        {/* Instruction accordion */}
        {instruction && (
          <InstructionAccordion childrenCount={blocks.length} instruction={instruction} />
        )}

        {/* Processing or Completed view */}
        {isProcessing ? (
          <ProcessingView
            accumulatedUsage={accumulatedUsage}
            messages={messages}
            model={model}
            provider={provider}
            startTime={startTime}
            totalToolCalls={totalToolCalls}
          />
        ) : (
          <CompletedView
            assistantId={assistantId}
            blocks={blocks}
            duration={duration}
            model={model}
            provider={provider}
            totalCost={totalCost}
            totalTokens={accumulatedUsage.totalTokens}
            totalToolCalls={totalToolCalls}
          />
        )}
      </div>
    );
  },
);

TaskMessages.displayName = 'TaskMessages';

export default TaskMessages;
