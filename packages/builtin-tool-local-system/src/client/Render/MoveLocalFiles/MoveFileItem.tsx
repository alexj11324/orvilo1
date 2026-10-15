import { useToolRenderCapabilities } from '@orvilo/shared-tool-ui';
import { cn } from 'cn';
import { ArrowRight } from 'lucide-react';
import { memo } from 'react';

const styles = {
  icon: 'text-foreground-quaternary',
  item: 'rounded-(--radius-card) px-3 py-1 transition-[background-color] duration-200 ease-[ease] hover:bg-fill-quaternary',
  path: 'font-mono text-xs break-all',
};

interface MoveFileItemProps {
  newPath: string;
  oldPath: string;
}

const MoveFileItem = memo<MoveFileItemProps>(({ oldPath, newPath }) => {
  const { displayRelativePath } = useToolRenderCapabilities();
  const displayOldPath = displayRelativePath ? displayRelativePath(oldPath) : oldPath;
  const displayNewPath = displayRelativePath ? displayRelativePath(newPath) : newPath;

  return (
    <div className={cn('flex flex-row items-center gap-2 w-full', styles.item)}>
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
