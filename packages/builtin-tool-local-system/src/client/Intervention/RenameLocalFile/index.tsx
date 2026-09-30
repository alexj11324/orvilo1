import type { RenameLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { ArrowRight, ChevronRight } from 'lucide-react';
import path from 'path-browserify-esm';
import { memo } from 'react';

import { LocalFile, LocalFolder } from '@/features/LocalFile';

import OutOfScopeWarning from '../OutOfScopeWarning';

const RenameLocalFile = memo<BuiltinInterventionProps<RenameLocalFileParams>>(({ args }) => {
  const { path: filePath, newName } = args;
  const { base, dir } = path.parse(filePath || '');

  return (
    <div className="flex flex-col gap-3">
      <OutOfScopeWarning paths={[filePath]} />
      <div className="flex flex-row">
        <LocalFolder path={dir} />
        <span className="anticon" role="img">
          <ChevronRight fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
        </span>
        <LocalFile name={base} path={filePath} />
      </div>
      <div className="flex flex-row items-center gap-2">
        <div className="text-muted-foreground">{base}</div>
        <span className="anticon" role="img">
          <ArrowRight fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
        </span>
        <div>{newName}</div>
      </div>
    </div>
  );
});

RenameLocalFile.displayName = 'RenameLocalFileIntervention';

export default RenameLocalFile;
