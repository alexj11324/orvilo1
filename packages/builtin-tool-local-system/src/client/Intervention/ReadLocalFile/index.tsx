import type { LocalReadFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { ChevronRight } from 'lucide-react';
import path from 'path-browserify-esm';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { LocalFile, LocalFolder } from '@/features/LocalFile';

import OutOfScopeWarning from '../OutOfScopeWarning';

const ReadLocalFile = memo<BuiltinInterventionProps<LocalReadFileParams>>(({ args }) => {
  const { t } = useTranslation('tool');
  const { base, dir } = path.parse(args.path || '');

  return (
    <div className="flex flex-col gap-3">
      <OutOfScopeWarning paths={[args.path]} />
      <div className="flex flex-row">
        <LocalFolder path={dir} />
        <span className="anticon" role="img">
          <ChevronRight fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
        </span>
        <LocalFile name={base} path={args.path} />
      </div>
      {args.loc && (
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          {t('localFiles.readFile.lineRange', { end: args.loc[1], start: args.loc[0] })}
        </div>
      )}
    </div>
  );
});

ReadLocalFile.displayName = 'ReadLocalFileIntervention';

export default ReadLocalFile;
