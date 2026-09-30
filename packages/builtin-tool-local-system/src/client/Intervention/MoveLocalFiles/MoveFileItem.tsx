import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { ArrowRight } from 'lucide-react';
import { memo } from 'react';

import { useElectronStore } from '@/store/electron';
import { desktopStateSelectors } from '@/store/electron/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  icon: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  item: css`
    padding-block: 4px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadius};
    transition: all 0.2s ease;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  path: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    word-break: break-all;
  `,
}));

interface MoveFileItemProps {
  newPath: string;
  oldPath: string;
}

const MoveFileItem = memo<MoveFileItemProps>(({ oldPath, newPath }) => {
  const displayOldPath = useElectronStore(desktopStateSelectors.displayRelativePath(oldPath));
  const displayNewPath = useElectronStore(desktopStateSelectors.displayRelativePath(newPath));

  return (
    <div className={cx('flex flex-row items-center gap-2 w-[100%]', styles.item)}>
      <div className="flex flex-col flex-1">
        <div className={cn('text-muted-foreground', styles.path)}>{displayOldPath}</div>
      </div>
      <span className={cx('anticon', styles.icon)} role="img">
        <ArrowRight fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
      </span>
      <div className="flex flex-col" style={{ flex: 2 }}>
        <div className={cn(styles.path)}>{displayNewPath}</div>
      </div>
    </div>
  );
});

export default MoveFileItem;
