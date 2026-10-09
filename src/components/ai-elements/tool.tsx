'use client';

import type { DynamicToolUIPart, ToolUIPart } from 'ai';
import { cn } from 'cn';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { isValidElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn('group not-prose mb-4 w-full rounded-md border', className)}
    data-ai-element="tool"
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: ReactNode;
  children?: ReactNode;
  hideChevron?: boolean;
  statusLabel?: string;
  statusIcon?: ReactNode;
  className?: string;
} & (
  | { type: ToolUIPart['type']; state: ToolUIPart['state']; toolName?: never }
  | {
      type: DynamicToolUIPart['type'];
      state: DynamicToolUIPart['state'];
      toolName: string;
    }
);

const statusKeys = {
  'approval-requested': 'awaitingApproval',
  'approval-responded': 'responded',
  'input-available': 'running',
  'input-streaming': 'pending',
  'output-available': 'completed',
  'output-denied': 'denied',
  'output-error': 'error',
} as const;

const statusIcons: Record<ToolPart['state'], ReactNode> = {
  'approval-requested': <ClockIcon className="size-4 text-warning" />,
  'approval-responded': <CheckCircleIcon className="size-4 text-info" />,
  'input-available': <ClockIcon className="size-4 animate-pulse" />,
  'input-streaming': <CircleIcon className="size-4" />,
  'output-available': <CheckCircleIcon className="size-4 text-success" />,
  'output-denied': <XCircleIcon className="size-4 text-warning" />,
  'output-error': <XCircleIcon className="size-4 text-destructive" />,
};

export const getStatusBadge = (
  status: ToolPart['state'],
  label: string,
  icon = statusIcons[status],
) => (
  <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
    {icon}
    {label}
  </Badge>
);

export const ToolHeader = ({
  className,
  children,
  hideChevron,
  statusLabel,
  statusIcon,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const { t } = useTranslation('chat');
  const derivedName = type === 'dynamic-tool' ? toolName : type.split('-').slice(1).join('-');

  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-full items-center justify-between gap-4 p-3 text-left rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {children ?? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-words font-medium text-sm">{title ?? derivedName}</span>
          {getStatusBadge(
            state,
            statusLabel ?? t(`components.aiElements.tool.${statusKeys[state]}`),
            statusIcon,
          )}
        </div>
      )}
      {!hideChevron && (
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none group-data-[open]:rotate-180" />
      )}
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      'data-[closed]:fade-out-0 data-[closed]:slide-out-to-top-2 data-[open]:slide-in-from-top-2 space-y-4 p-4 text-popover-foreground outline-none data-[closed]:animate-out data-[open]:animate-in',
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<'div'> & {
  input: ToolPart['input'];
};

export const ToolInput = ({ className, input, children, ...props }: ToolInputProps) => {
  const { t } = useTranslation('chat');
  return (
    <div className={cn('space-y-2 overflow-hidden', className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t('components.aiElements.tool.parameters')}
      </h4>
      <div className="rounded-md bg-muted/50">
        {children ?? <CodeBlock code={JSON.stringify(input, null, 2) ?? ''} language="json" />}
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<'div'> & {
  output: ToolPart['output'];
  errorText: ToolPart['errorText'];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  const { t } = useTranslation('chat');
  if (output == null && !errorText) {
    return null;
  }

  let Output = <div>{typeof output === 'boolean' ? String(output) : (output as ReactNode)}</div>;

  if (typeof output === 'object' && !isValidElement(output)) {
    Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === 'string') {
    Output = <CodeBlock code={output} language="text" />;
  }

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t(errorText ? 'components.aiElements.tool.error' : 'components.aiElements.tool.result')}
      </h4>
      <div
        className={cn(
          'overflow-x-auto rounded-md text-xs [&_table]:w-full',
          errorText ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-foreground',
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
