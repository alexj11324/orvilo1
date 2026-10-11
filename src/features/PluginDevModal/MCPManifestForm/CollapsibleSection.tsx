import { cn } from 'cn';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode } from 'react';
import { useState } from 'react';

import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  container: 'mbe-6',
  header:
    'flex min-h-9 cursor-pointer items-center rounded-(--radius-button) text-foreground-tertiary transition-colors duration-(--orvilo-motion-mid) ease-[ease] hover:text-foreground',
  title: 'ms-1 text-sm font-semibold text-foreground',
};

interface CollapsibleSectionProps {
  /** Child component content */
  children: ReactNode;
  /** Whether expanded by default */
  defaultExpanded?: boolean;
  /** Title text */
  title: string;
}

const CollapsibleSection = ({
  title,
  children,
  defaultExpanded = false,
}: CollapsibleSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={styles.container}>
      <div
        {...clickableProps()}
        className={cn(styles.header, CLICKABLE_FOCUS_RING)}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className={styles.title}>{title}</span>
      </div>
      {isExpanded && <div>{children}</div>}
    </div>
  );
};

export default CollapsibleSection;
