import { cn } from 'cn';
import { type CSSProperties, memo } from 'react';

const styles = {
  container: 'inline-flex flex-row items-center gap-(--dots-loading-gap)',
  dot: 'size-(--dots-loading-size) rounded-full bg-(--dots-loading-color) animate-dots-loading-fade',
};

interface StyleArgs {
  color?: string;
  gap?: number;
  size?: number;
}

interface DotsLoadingProps extends StyleArgs {
  className?: string;
  style?: CSSProperties;
}

const DotsLoading = memo<DotsLoadingProps>(({ size = 4, gap = 3, color, className, style }) => {
  const cssVars = {
    '--dots-loading-color': color || 'var(--muted-foreground)',
    '--dots-loading-gap': `${gap}px`,
    '--dots-loading-size': `${size}px`,
  } as CSSProperties;

  return (
    <div className={cn(styles.container, className)} style={{ ...cssVars, ...style }}>
      <div className={styles.dot} style={{ animationDelay: '0s' }} />
      <div className={styles.dot} style={{ animationDelay: '0.15s' }} />
      <div className={styles.dot} style={{ animationDelay: '0.3s' }} />
    </div>
  );
});

export default DotsLoading;
