import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode } from 'react';
import { useState } from 'react';

import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    margin-block-end: ${cssVar.marginLG};
  `,

  header: css`
    cursor: pointer;

    display: flex;
    align-items: center;

    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextTertiary};

    transition: all ${cssVar.motionDurationMid} ease;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,

  title: css`
    margin-inline-start: 4px;
    font-weight: ${cssVar.fontWeightStrong};
    color: ${cssVar.colorText};
  `,
}));

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
        className={cn(cx(styles.header), CLICKABLE_FOCUS_RING)}
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
