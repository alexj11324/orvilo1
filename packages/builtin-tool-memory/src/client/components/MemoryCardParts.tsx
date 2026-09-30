'use client';

import { Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { memo } from 'react';

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
export const memoryCardStyles = createStaticStyles(({ css, cssVar }) => ({
  chip: css`
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 6px;

    font-size: 12px;
    line-height: 1.4;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
  `,
  chipType: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  container: css`
    overflow: hidden;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};
  `,
  content: css`
    padding-block: 12px;
    padding-inline: 16px;
  `,
  detail: css`
    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};
  `,
  header: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  section: css`
    padding: 4px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sectionBody: css`
    font-size: 14px;
    line-height: 1.6;
    color: ${cssVar.colorText};
  `,
  summary: css`
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
  tags: css`
    padding-block-start: 8px;
    border-block-start: 1px dashed ${cssVar.colorBorderSecondary};
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

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
    <Text fontSize={12} weight={500}>
      <span className={highlightTextStyles[tone]}>{title}</span>
    </Text>
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
          <Text fontSize={12} type={'secondary'} weight={500}>
            Summary
          </Text>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-2 px-2" style={{ paddingBlock: '8px 12px' }}>
            {summary && <div className={memoryCardStyles.summary}>{summary}</div>}
            {details && <div className={memoryCardStyles.detail}>{details}</div>}
            {tags.length > 0 && (
              <div className={cn('flex', 'gap-2', 'flex-wrap', memoryCardStyles.tags)}>
                {tags.map((tag, index) => (
                  <Tag key={index}>{tag}</Tag>
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
