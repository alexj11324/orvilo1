'use client';

import Ansi from 'ansi-to-react';
import { cn } from 'cn';
import { CheckIcon, CopyIcon, TerminalIcon, Trash2Icon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes } from 'react';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';

interface TerminalContextType {
  autoScroll: boolean;
  isStreaming: boolean;
  onClear?: () => void;
  output: string;
}

const TerminalContext = createContext<TerminalContextType>({
  autoScroll: true,
  isStreaming: false,
  output: '',
});

export type TerminalHeaderProps = HTMLAttributes<HTMLDivElement>;

export const TerminalHeader = ({ className, children, ...props }: TerminalHeaderProps) => (
  <div
    className={cn('flex items-center justify-between border-border border-b px-4 py-2', className)}
    {...props}
  >
    {children}
  </div>
);

export type TerminalTitleProps = HTMLAttributes<HTMLDivElement>;

export const TerminalTitle = ({ className, children, ...props }: TerminalTitleProps) => {
  const { t } = useTranslation('chat');
  return (
    <div
      className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}
      {...props}
    >
      <TerminalIcon className="size-4" />
      {children ?? t('components.aiElements.terminal.title')}
    </div>
  );
};

export type TerminalStatusProps = HTMLAttributes<HTMLDivElement>;

export const TerminalStatus = ({ className, children, ...props }: TerminalStatusProps) => {
  const { isStreaming } = use(TerminalContext);

  if (!isStreaming) {
    return null;
  }

  return (
    <div
      className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}
      {...props}
    >
      {children}
    </div>
  );
};

export type TerminalActionsProps = HTMLAttributes<HTMLDivElement>;

export const TerminalActions = ({ className, children, ...props }: TerminalActionsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props}>
    {children}
  </div>
);

export type TerminalCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const TerminalCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: TerminalCopyButtonProps) => {
  const { t } = useTranslation('common');
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { output } = use(TerminalContext);

  const copyToClipboard = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      onError?.(new Error('Clipboard API not available'));
      toast.error(t('copyFail'));
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setIsCopied(true);
      onCopy?.();
      timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
      toast.error(t('copyFail'));
    }
  }, [output, onCopy, onError, timeout, t]);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      aria-label={isCopied ? t('copySuccess') : t('copy')}
      size="icon"
      title={isCopied ? t('copySuccess') : t('copy')}
      type="button"
      variant="ghost"
      className={cn(
        'size-7 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className,
      )}
      onClick={copyToClipboard}
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};

export type TerminalClearButtonProps = ComponentProps<typeof Button>;

export const TerminalClearButton = ({
  children,
  className,
  ...props
}: TerminalClearButtonProps) => {
  const { t } = useTranslation('common');
  const { onClear } = use(TerminalContext);

  if (!onClear) {
    return null;
  }

  return (
    <Button
      aria-label={t('clear')}
      size="icon"
      type="button"
      variant="ghost"
      className={cn(
        'size-7 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className,
      )}
      onClick={onClear}
      {...props}
    >
      {children ?? <Trash2Icon size={14} />}
    </Button>
  );
};

export type TerminalContentProps = HTMLAttributes<HTMLDivElement>;

export const TerminalContent = ({ className, children, ...props }: TerminalContentProps) => {
  const { output, isStreaming, autoScroll } = use(TerminalContext);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  return (
    <div
      className={cn('max-h-96 overflow-auto p-4 font-mono text-sm leading-relaxed', className)}
      ref={containerRef}
      {...props}
    >
      {children ?? (
        <pre className="whitespace-pre-wrap break-words">
          <Ansi>{output}</Ansi>
          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse motion-reduce:animate-none bg-foreground" />
          )}
        </pre>
      )}
    </div>
  );
};

export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string;
  isStreaming?: boolean;
  autoScroll?: boolean;
  onClear?: () => void;
};

export const Terminal = ({
  output,
  isStreaming = false,
  autoScroll = true,
  onClear,
  className,
  children,
  ...props
}: TerminalProps) => {
  const contextValue = useMemo(
    () => ({ autoScroll, isStreaming, onClear, output }),
    [autoScroll, isStreaming, onClear, output],
  );

  return (
    <TerminalContext value={contextValue}>
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <TerminalHeader>
              <TerminalTitle />
              <div className="flex items-center gap-1">
                <TerminalStatus />
                <TerminalActions>
                  <TerminalCopyButton />
                  {onClear && <TerminalClearButton />}
                </TerminalActions>
              </div>
            </TerminalHeader>
            <TerminalContent />
          </>
        )}
      </div>
    </TerminalContext>
  );
};
