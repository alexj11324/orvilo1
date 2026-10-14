import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';

interface PropertyGroupProps {
  children: ReactNode;
  className?: string;
  /** The group's visible label — "Properties", "Labels", "Project". */
  label: string;
}

/**
 * One labelled group of the issue rail — Linear's Properties / Labels /
 * Project (and later Related) sections. Each group is a direct child of
 * `propertyGroups`: in a narrow pane the wrapper dissolves into the chip
 * strip and its label stays hidden; in the wide rail the compact
 * secondary-ink label heads its own block.
 */
const PropertyGroup = memo<PropertyGroupProps>(({ children, className, label }) => (
  <div className={cn(styles.railSection, className)}>
    <span className={styles.railSectionLabel}>{label}</span>
    {children}
  </div>
));

PropertyGroup.displayName = 'PropertyGroup';

export default PropertyGroup;
