import classes from './TaskTemplateCard.module.css';

export const styles = {
  card: classes.card,
  compactMain: classes.compactMain,
  compactRow: `${classes.compactRow} motion-reduce:transition-none`,
  compactTitle: 'min-w-0',
  dismissBtn: classes.dismissBtn,
} as const;
