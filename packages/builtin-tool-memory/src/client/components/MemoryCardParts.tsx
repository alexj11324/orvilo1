'use client';

import { cn } from 'cn';
import type { ReactNode } from 'react';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { highlightTextStyles } from '@/styles';

import type { MemoryEntity } from './memoryArgs';
import { ENTITY_ICONS, FALLBACK_ENTITY_ICON } from './memoryArgs';

/**
 * Layout shared by the context / activity / identity memory cards, so a memory
 * reads the same whichever layer it was written to.
 */
export const memoryCardStyles = {
  chip: '[padding-block:4px] [padding-inline:8px] rounded-(--radius-input) text-xs leading-[1.4] text-foreground bg-(--ant-color-fill-quaternary)',
  chipType: 'text-(--ant-color-text-quaternary)',
  container: 'overflow-hidden w-full border border-sidebar-border rounded-[16px] bg-card',
  content: '[padding-block:12px] [padding-inline:16px]',
  detail: 'text-[13px] leading-[1.6] text-muted-foreground',
  header:
    '[padding-block:10px] [padding-inline:12px] [border-block-end:1px_solid_var(--sidebar-border)]',
  section: 'p-1 [border-block-start:1px_solid_var(--sidebar-border)]',
  sectionBody: 'text-sm leading-[1.6] text-foreground',
  summary: 'text-sm leading-[inherit] font-medium text-muted-foreground',
  tags: '[padding-block-start:8px] [border-block-start:1px_dashed_var(--sidebar-border)]',
  title: 'line-clamp-1 font-medium text-foreground',
};

interface MemorySectionProps {
  children: ReactNode;
  title: string;
  /** Which highlight underline the label wears. */
  tone?: 'gold' | 'info' | 'primary' | 'warning';
}

/** A labelled block below the header, e.g. `Description`, `Narrative`, `Evidence`. */
export const MemorySection = memo<MemorySectionProps>(({ children, title, tone = 'primary' }) => (
  <div
    className={cn('flex', 'flex-col', 'gap-2', memoryCardStyles.section)}
    style={{ paddingBlock: 16, paddingInline: 12 }}
  >
    <div className="text-[12px] font-medium">
      <span className={highlightTextStyles[tone]}>{title}</span>
    </div>
    {children}
  </div>
));

MemorySection.displayName = 'MemorySection';

interface EntityChipsProps {
  entities: MemoryEntity[];
}

/** People, places, and things involved in a memory, as compact chips. */
export const EntityChips = memo<EntityChipsProps>(({ entities }) => (
  <div className="flex gap-2 flex-wrap">
    {entities.map((entity, index) => {
      const chip = (
        <div className={cn('flex', 'items-center', 'gap-[6px]', memoryCardStyles.chip)} key={index}>
          <span>{(entity.type && ENTITY_ICONS[entity.type]) || FALLBACK_ENTITY_ICON}</span>
          <span>{entity.name}</span>
          {entity.type && <span className={memoryCardStyles.chipType}>{entity.type}</span>}
        </div>
      );

      // `extra` is raw JSON metadata — keep it out of the chip, on hover only
      return entity.extra ? (
        <Tooltip key={index}>
          <TooltipTrigger render={chip} />
          <TooltipContent>{entity.extra}</TooltipContent>
        </Tooltip>
      ) : (
        chip
      );
    })}
  </div>
));

EntityChips.displayName = 'EntityChips';

interface SummaryAccordionProps {
  details?: string;
  summary?: string;
  tags: string[];
}

/**
 * The summary/details/tags block, collapsed by default. Used when the card has
 * richer layer-specific content to lead with instead.
 */
export const SummaryAccordion = memo<SummaryAccordionProps>(({ details, summary, tags }) => {
  if (!summary && tags.length === 0) return null;

  return (
    <Accordion>
      <AccordionItem value="summary">
        <AccordionTrigger>
          <div className="text-[12px] text-muted-foreground font-medium">Summary</div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-2 px-2" style={{ paddingBlock: '8px 12px' }}>
            {summary && <div className={memoryCardStyles.summary}>{summary}</div>}
            {details && <div className={memoryCardStyles.detail}>{details}</div>}
            {tags.length > 0 && (
              <div className={cn('flex', 'gap-2', 'flex-wrap', memoryCardStyles.tags)}>
                {tags.map((tag, index) => (
                  <Badge key={index}>{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
});

SummaryAccordion.displayName = 'SummaryAccordion';
