import { cn } from 'cn';
import { ArrowRight } from 'lucide-react';
import { memo } from 'react';

import { useElectronStore } from '@/store/electron';
import { desktopStateSelectors } from '@/store/electron/selectors';

const styles = {
  icon: 'text-[var(--ant-color-text-quaternary)]',
  item: 'rounded-[var(--ant-border-radius)] px-3 py-1 transition-[background-color] duration-200 ease-[ease] hover:bg-[var(--ant-color-fill-quaternary)]',
  path: 'font-mono text-[12px] break-all',
};

interface MoveFileItemProps {
  newPath: string;
  oldPath: string;
}

const MoveFileItem = memo<MoveFileItemProps>(({ oldPath, newPath }) => {
  const displayOldPath = useElectronStore(desktopStateSelectors.displayRelativePath(oldPath));
  const displayNewPath = useElectronStore(desktopStateSelectors.displayRelativePath(newPath));

  return (
    <div className={cn('flex flex-row items-center gap-2 w-[100%]', styles.item)}>
      <div className="flex flex-col flex-1">
        <div className={cn('text-muted-foreground', styles.path)}>{displayOldPath}</div>
      </div>
      <span className={cn('anticon', styles.icon)} role="img">
        <ArrowRight fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
      </span>
      <div className="flex flex-col" style={{ flex: 2 }}>
        <div className={cn(styles.path)}>{displayNewPath}</div>
      </div>
    </div>
  );
});

export default MoveFileItem;
