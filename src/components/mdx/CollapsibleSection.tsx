'use client';

import { createStaticStyles } from 'antd-style';
import { kebabCase } from 'es-toolkit';
import { type FC, type ReactNode } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const styles = createStaticStyles(({ css, cssVar }) => ({
  collapse: css`
    margin-block: 1em;
  `,
  label: css`
    font-size: 1.25em;
    font-weight: 600;
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
}));

interface CollapsibleSectionProps {
  children?: ReactNode;
  title?: string;
}

/**
 * Renders a changelog section ("Improvements" / "Fixes") inside a Collapse that
 * is collapsed by default. Injected by `remarkCollapsibleSections` as the
 * `<collapsible-section>` element.
 */
const CollapsibleSection: FC<CollapsibleSectionProps> = ({ children, title = '' }) => {
  const id = kebabCase(title);

  return (
    <Accordion className={styles.collapse} defaultValue={[]}>
      <AccordionItem value={id || 'section'}>
        <AccordionTrigger>
          <span className={styles.label}>{title}</span>
        </AccordionTrigger>
        <AccordionContent style={{ padding: '12px 16px' }}>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

CollapsibleSection.displayName = 'CollapsibleSection';

export default CollapsibleSection;
