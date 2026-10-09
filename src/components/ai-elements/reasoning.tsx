'use client';

import { useControllableState } from '@radix-ui/react-use-controllable-state';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { cn } from 'cn';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, memo, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Streamdown } from 'streamdown';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import { Shimmer } from './shimmer';

interface ReasoningContextValue {
  duration: number | undefined;
  isOpen: boolean;
  isStreaming: boolean;
  setIsOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = use(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    // Track if defaultOpen was explicitly set to false (to prevent auto-open)
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const startTimeRef = useRef<number | null>(null);

    // Track when streaming starts and compute duration
    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    // Uncontrolled instances follow upstream auto-open/close behavior.
    // A domain-controlled instance owns its expansion and must not be reopened
    // after a user manually collapses it during streaming.
    useEffect(() => {
      if (open === undefined && isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpen(true);
      }
    }, [open, isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

    // Auto-close when streaming ends (once only, and only if it ever streamed)
    useEffect(() => {
      if (
        open === undefined &&
        hasEverStreamedRef.current &&
        !isStreaming &&
        isOpen &&
        !hasAutoClosed
      ) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [open, isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
      },
      [setIsOpen],
    );

    const contextValue = useMemo(
      () => ({ duration, isOpen, isStreaming, setIsOpen }),
      [duration, isOpen, isStreaming, setIsOpen],
    );

    return (
      <ReasoningContext value={contextValue}>
        <Collapsible
          className={cn('not-prose mb-4', className)}
          data-ai-element="reasoning"
          open={isOpen}
          onOpenChange={handleOpenChange}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  icon?: ReactNode;
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

export const ReasoningTrigger = memo(
  ({ className, children, getThinkingMessage, icon, ...props }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration } = useReasoning();
    const { t } = useTranslation('chat');
    const thinkingMessage = getThinkingMessage ? (
      getThinkingMessage(isStreaming, duration)
    ) : isStreaming ? (
      <Shimmer duration={1}>{t('components.aiElements.reasoning.thinking')}</Shimmer>
    ) : (
      <span>
        {duration === undefined
          ? t('components.aiElements.reasoning.thought')
          : t('components.aiElements.reasoning.thoughtWithDuration', { duration })}
      </span>
    );

    return (
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            {icon ?? <BrainIcon className="size-4" />}
            {thinkingMessage}
          </>
        )}
        <ChevronDownIcon
          className={cn(
            'ml-auto size-4 shrink-0 transition-transform motion-reduce:transition-none',
            isOpen ? 'rotate-180' : 'rotate-0',
          )}
        />
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: ReactNode;
};

const streamdownPlugins = { cjk, code, math, mermaid };

export const ReasoningContent = memo(({ className, children, ...props }: ReasoningContentProps) => (
  <CollapsibleContent
    className={cn(
      'mt-4 text-sm',
      'data-[closed]:fade-out-0 data-[closed]:slide-out-to-top-2 data-[open]:slide-in-from-top-2 text-muted-foreground outline-none data-[closed]:animate-out data-[open]:animate-in',
      className,
    )}
    {...props}
  >
    {typeof children === 'string' ? (
      <Streamdown plugins={streamdownPlugins}>{children}</Streamdown>
    ) : (
      children
    )}
  </CollapsibleContent>
));

Reasoning.displayName = 'Reasoning';
ReasoningTrigger.displayName = 'ReasoningTrigger';
ReasoningContent.displayName = 'ReasoningContent';
