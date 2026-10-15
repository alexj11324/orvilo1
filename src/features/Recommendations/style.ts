import classes from './Recommendations.module.css';

export const styles = {
  card: classes.card,
  compactRow: classes.compactRow,
  compactTitle: 'min-w-0',
  refreshAction: classes.refreshAction,
  refreshSpin: `${classes.refreshSpin} motion-reduce:animate-none`,
  subtitle: 'text-foreground-description',
} as const;
