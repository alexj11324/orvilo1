'use client';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { cn } from 'cn';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      className={cn('flex w-full flex-col', className)}
      data-slot="accordion"
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      className={cn('not-last:border-be', className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  iconClassName,
  ...props
}: AccordionPrimitive.Trigger.Props & { iconClassName?: string }) {
  return (
    <AccordionPrimitive.Header className="flex" style={{ margin: 0 }}>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger relative flex flex-1 items-center justify-between min-h-9 pointer-coarse:min-h-11 rounded-(--radius-button) border border-transparent py-1.5 text-start text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity] duration-(--orvilo-motion-mid) motion-reduce:transition-none outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          className={cn(
            'pointer-events-none ms-auto size-4 shrink-0 text-muted-foreground group-aria-expanded/accordion-trigger:hidden',
            iconClassName,
          )}
        />
        <ChevronUpIcon
          data-slot="accordion-trigger-icon"
          className={cn(
            'pointer-events-none ms-auto hidden size-4 shrink-0 text-muted-foreground group-aria-expanded/accordion-trigger:inline',
            iconClassName,
          )}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      className="h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-(--orvilo-motion-mid) data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
      data-slot="accordion-content"
      {...props}
    >
      <div
        className={cn(
          'pbs-0 pbe-2.5 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mbe-4',
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
