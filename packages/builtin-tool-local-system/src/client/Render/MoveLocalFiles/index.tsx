import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import MoveFileItem from './MoveFileItem';

interface MoveFilesArgs {
  items?: Array<{ newPath: string; oldPath: string }>;
  operations?: Array<{ destination: string; source: string }>;
}

const MoveLocalFiles = memo<BuiltinRenderProps<MoveFilesArgs>>(({ args }) => {
  const { t } = useTranslation('tool');

  // Support both IPC format (items) and ComputerRuntime format (operations)
  const moveItems = (args.items || args.operations || []).map((item: any) => ({
    newPath: item.newPath || item.destination || '',
    oldPath: item.oldPath || item.source || '',
  }));

  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground">
        {t('localFiles.moveFiles.itemsMoved', { count: moveItems.length })}
      </div>
      <div className="flex flex-col gap-1.5">
        {moveItems.map((item, index) => (
          <MoveFileItem key={index} newPath={item.newPath} oldPath={item.oldPath} />
        ))}
      </div>
    </div>
  );
});

export default MoveLocalFiles;
