import type { ListLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';

import { LocalFolder } from '@/features/LocalFile';

import OutOfScopeWarning from '../OutOfScopeWarning';

const ListLocalFiles = memo<BuiltinInterventionProps<ListLocalFileParams>>(({ args }) => {
  const { path } = args;

  return (
    <div className="flex flex-col gap-3">
      <OutOfScopeWarning paths={[path]} />
      <LocalFolder path={path} />
    </div>
  );
});

ListLocalFiles.displayName = 'ListLocalFilesIntervention';

export default ListLocalFiles;
