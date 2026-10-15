'use client';

import { kebabCase } from 'es-toolkit';
import { type FC, type ReactNode } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const styles = {
  collapse: 'mbs-4 mbe-4',
  label: 'text-xl font-semibold leading-7 text-foreground',
};

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
        <AccordionTrigger className="rounded-(--radius-button)">
          <span className={styles.label}>{title}</span>
        </AccordionTrigger>
        <AccordionContent style={{ padding: '12px 16px' }}>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

CollapsibleSection.displayName = 'CollapsibleSection';

export default CollapsibleSection;
