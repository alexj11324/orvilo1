import { cn } from 'cn';
import { type PropsWithChildren } from 'react';
import { memo } from 'react';

const styles = {
  desc: 'line-clamp-1 mbe-0 text-sm text-muted-foreground transition-[margin-block-start,height,opacity] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out) motion-reduce:transition-none',
  hideDesc: 'h-0 mbs-0 opacity-0',
  visibleDesc: 'h-5.5 mbs-1',
};

const CollapseDesc = memo<PropsWithChildren<{ hide?: boolean }>>(({ children, hide }) => {
  return <p className={cn(styles.desc, hide ? styles.hideDesc : styles.visibleDesc)}>{children}</p>;
});

export default CollapseDesc;
