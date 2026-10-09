'use client';

import { cn } from 'cn';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export type TaskItemFileProps = ComponentProps<'div'>;

export const TaskItemFile = ({ children, className, ...props }: TaskItemFileProps) => (
  <div
    className={cn(
      'inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-foreground text-xs',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type TaskItemProps = ComponentProps<'div'>;

export const TaskItem = ({ children, className, ...props }: TaskItemProps) => (
  <div className={cn('text-muted-foreground text-sm', className)} {...props}>
    {children}
  </div>
);

export type TaskProps = ComponentProps<typeof Collapsible>;

export const Task = ({ defaultOpen = true, className, ...props }: TaskProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
};

export const TaskTrigger = ({ children, className, title, ...props }: TaskTriggerProps) => (
  <CollapsibleTrigger
    nativeButton={false}
    render={<div />}
    className={cn(
      'group flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <SearchIcon className="size-4" />
        <span className="text-sm">{title}</span>
      </>
    )}
    <ChevronDownIcon className="ml-auto size-4 shrink-0 transition-transform group-data-open:rotate-180" />
  </CollapsibleTrigger>
);

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({ children, className, ...props }: TaskContentProps) => (
  <CollapsibleContent
    className={cn(
      'data-[ending-style]:fade-out-0 data-[ending-style]:slide-out-to-top-2 data-[starting-style]:slide-in-from-top-2 text-popover-foreground outline-none data-[ending-style]:animate-out data-[starting-style]:animate-in',
      className,
    )}
    {...props}
  >
    <div className="mt-4 space-y-2 border-muted border-l-2 pl-4">{children}</div>
  </CollapsibleContent>
);
