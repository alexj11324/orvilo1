'use client';

import { cn } from 'cn';
import { CheckIcon, CopyIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';

interface SnippetContextType {
  code: string;
}

const SnippetContext = createContext<SnippetContextType>({
  code: '',
});

export type SnippetProps = ComponentProps<typeof InputGroup> & {
  code: string;
};

export const Snippet = ({ code, className, children, ...props }: SnippetProps) => {
  const contextValue = useMemo(() => ({ code }), [code]);

  return (
    <SnippetContext value={contextValue}>
      <InputGroup className={cn('font-mono', className)} {...props}>
        {children}
      </InputGroup>
    </SnippetContext>
  );
};

export type SnippetAddonProps = ComponentProps<typeof InputGroupAddon>;

export const SnippetAddon = (props: SnippetAddonProps) => <InputGroupAddon {...props} />;

export type SnippetTextProps = ComponentProps<typeof InputGroupText>;

export const SnippetText = ({ className, ...props }: SnippetTextProps) => (
  <InputGroupText className={cn('pl-2 font-normal text-muted-foreground', className)} {...props} />
);

export type SnippetInputProps = Omit<ComponentProps<typeof InputGroupInput>, 'readOnly' | 'value'>;

export const SnippetInput = ({ className, ...props }: SnippetInputProps) => {
  const { code } = use(SnippetContext);

  return (
    <InputGroupInput
      readOnly
      className={cn('text-foreground', className)}
      value={code}
      {...props}
    />
  );
};

export type SnippetCopyButtonProps = ComponentProps<typeof InputGroupButton> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const SnippetCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: SnippetCopyButtonProps) => {
  const { t } = useTranslation('common');
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { code } = use(SnippetContext);

  const copyToClipboard = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      onError?.(new Error('Clipboard API not available'));
      toast.error(t('copyFail'));
      return;
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(code);
        setIsCopied(true);
        onCopy?.();
        timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout);
      }
    } catch (error) {
      onError?.(error as Error);
      toast.error(t('copyFail'));
    }
  }, [code, onCopy, onError, timeout, isCopied, t]);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <InputGroupButton
      aria-label={isCopied ? t('copySuccess') : t('copy')}
      className={className}
      size="icon-sm"
      title={isCopied ? t('copySuccess') : t('copy')}
      type="button"
      onClick={copyToClipboard}
      {...props}
    >
      {children ?? <Icon className="size-3.5" size={14} />}
    </InputGroupButton>
  );
};
