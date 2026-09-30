import { Text } from '@lobehub/ui/base-ui';
import { type GrepContentParams } from '@orvilo/electron-client-ipc';
import { type BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { LocalFolder } from '@/features/LocalFile';

import OutOfScopeWarning from '../OutOfScopeWarning';

const GrepContent = memo<BuiltinInterventionProps<GrepContentParams>>(({ args }) => {
  const { t } = useTranslation('tool');
  const { pattern, scope, glob, type } = args;

  return (
    <div className="flex flex-col gap-3">
      <OutOfScopeWarning paths={scope ? [scope] : []} />
      {scope && <LocalFolder path={scope} />}
      <div className="flex flex-col gap-1">
        <Text type="secondary">{t('localFiles.grepContent.pattern')}</Text>
        <CodeBlock code={pattern} language="regex" variant={'default'} />
      </div>
      {glob && (
        <Text style={{ fontSize: 12 }} type="secondary">
          {t('localFiles.grepContent.glob')}: {glob}
        </Text>
      )}
      {type && (
        <Text style={{ fontSize: 12 }} type="secondary">
          {t('localFiles.grepContent.type')}: {type}
        </Text>
      )}
    </div>
  );
});

GrepContent.displayName = 'GrepContentIntervention';

export default GrepContent;
