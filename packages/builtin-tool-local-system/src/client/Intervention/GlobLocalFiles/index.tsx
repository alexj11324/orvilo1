import { type GlobFilesParams } from '@orvilo/electron-client-ipc';
import { type BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import OutOfScopeWarning from '../OutOfScopeWarning';

const GlobLocalFiles = memo<BuiltinInterventionProps<GlobFilesParams>>(({ args }) => {
  const { t } = useTranslation('tool');
  const { pattern } = args;

  return (
    <div className="flex flex-col gap-3">
      <OutOfScopeWarning paths={[pattern]} />
      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground">{t('localFiles.globFiles.pattern')}</div>
        <CodeBlock code={pattern} language="text" variant={'default'} />
      </div>
    </div>
  );
});

GlobLocalFiles.displayName = 'GlobLocalFilesIntervention';

export default GlobLocalFiles;
