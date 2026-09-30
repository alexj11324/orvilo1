import { Text } from '@lobehub/ui/base-ui';
import type { MoveLocalFilesParams } from '@orvilo/electron-client-ipc';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import OutOfScopeWarning from '../OutOfScopeWarning';
import MoveFileItem from './MoveFileItem';

const MoveLocalFiles = memo<BuiltinInterventionProps<MoveLocalFilesParams>>(({ args }) => {
  const { items } = args;
  const { t } = useTranslation('tool');

  // Collect all paths (source and destination) for validation
  const allPaths = useMemo(() => items.flatMap((item) => [item.oldPath, item.newPath]), [items]);

  return (
    <div className="flex flex-col gap-2">
      <OutOfScopeWarning paths={allPaths} />
      <Text type="secondary">{t('localFiles.moveFiles.itemsToMove', { count: items.length })}</Text>
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <MoveFileItem key={index} newPath={item.newPath} oldPath={item.oldPath} />
        ))}
      </div>
    </div>
  );
});

export default MoveLocalFiles;
