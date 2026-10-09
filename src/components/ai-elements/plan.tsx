'use client';

import { cn } from 'cn';
import { ChevronsUpDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { createContext, use, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import { Shimmer } from './shimmer';

interface PlanContextValue {
  isStreaming: boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

const usePlan = () => {
  const context = use(PlanContext);
  if (!context) {
    throw new Error('Plan components must be used within Plan');
  }
  return context;
};

export type PlanProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
};

export const Plan = ({ className, isStreaming = false, children, ...props }: PlanProps) => {
  const contextValue = useMemo(() => ({ isStreaming }), [isStreaming]);

  return (
    <PlanContext value={contextValue}>
      <Collapsible
        data-slot="plan"
        render={<Card className={cn('shadow-none', className)} />}
        {...props}
      >
        {children}
      </Collapsible>
    </PlanContext>
  );
};

export type PlanHeaderProps = ComponentProps<typeof CardHeader>;

export const PlanHeader = ({ className, ...props }: PlanHeaderProps) => (
  <CardHeader
    className={cn('flex items-start justify-between', className)}
    data-slot="plan-header"
    {...props}
  />
);

export type PlanTitleProps = Omit<ComponentProps<typeof CardTitle>, 'children'> & {
  children: string;
};

export const PlanTitle = ({ children, ...props }: PlanTitleProps) => {
  const { isStreaming } = usePlan();

  return (
    <CardTitle data-slot="plan-title" {...props}>
      {isStreaming ? <Shimmer>{children}</Shimmer> : children}
    </CardTitle>
  );
};

export type PlanDescriptionProps = Omit<ComponentProps<typeof CardDescription>, 'children'> & {
  children: string;
};

export const PlanDescription = ({ className, children, ...props }: PlanDescriptionProps) => {
  const { isStreaming } = usePlan();

  return (
    <CardDescription
      className={cn('text-balance', className)}
      data-slot="plan-description"
      {...props}
    >
      {isStreaming ? <Shimmer>{children}</Shimmer> : children}
    </CardDescription>
  );
};

export type PlanActionProps = ComponentProps<typeof CardAction>;

export const PlanAction = (props: PlanActionProps) => (
  <CardAction data-slot="plan-action" {...props} />
);

export type PlanContentProps = ComponentProps<typeof CardContent>;

export const PlanContent = ({ children, ...props }: PlanContentProps) => (
  <CollapsibleContent render={<CardContent data-slot="plan-content" {...props} />}>
    {children}
  </CollapsibleContent>
);

export type PlanFooterProps = ComponentProps<'div'>;

export const PlanFooter = (props: PlanFooterProps) => (
  <CardFooter data-slot="plan-footer" {...props} />
);

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const PlanTrigger = ({ className, children, ...props }: PlanTriggerProps) => {
  const { t } = useTranslation('chat');
  return (
    <CollapsibleTrigger
      data-slot="plan-trigger"
      render={<Button className={cn('size-8', className)} size="icon" variant="ghost" />}
      {...props}
    >
      {children ?? (
        <>
          <ChevronsUpDownIcon className="size-4" />
          <span className="sr-only">
            {t('aiElements.plan.toggle', { defaultValue: 'Toggle plan' })}
          </span>
        </>
      )}
    </CollapsibleTrigger>
  );
};
