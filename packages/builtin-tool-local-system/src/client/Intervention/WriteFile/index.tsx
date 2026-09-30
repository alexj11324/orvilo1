import { Text } from '@lobehub/ui/base-ui';
import type { WriteLocalFileParams } from '@orvilo/electron-client-ipc';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { ChevronRight } from 'lucide-react';
import path from 'path-browserify-esm';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { LocalFile, LocalFolder } from '@/features/LocalFile';

import OutOfScopeWarning from '../OutOfScopeWarning';

const WriteFile = memo<BuiltinInterventionProps<WriteLocalFileParams>>(({ args }) => {
  const { t } = useTranslation('tool');
  const { base, dir, ext } = path.parse(args.path || '');

  // Detect language from file extension
  const language = useMemo(() => {
    const extMap: Record<string, string> = {
      css: 'css',
      html: 'html',
      js: 'javascript',
      json: 'json',
      jsx: 'jsx',
      md: 'markdown',
      py: 'python',
      sh: 'bash',
      ts: 'typescript',
      tsx: 'tsx',
      txt: 'text',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return extMap[ext.replace('.', '')] || 'text';
  }, [ext]);

  const contentLength = args.content?.length || 0;

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

      <div className="flex flex-col gap-1">
        <div className="flex flex-row justify-between">
          <Text type="secondary">{t('localFiles.writeFile.preview')}</Text>
          <Text style={{ fontSize: 12 }} type={'secondary'}>
            {contentLength.toLocaleString()} {t('localFiles.writeFile.characters')}
          </Text>
        </div>

        {args.content && (
          <CodeBlock
            code={args.content}
            language={language}
            style={{ maxHeight: 400, overflow: 'auto', padding: '8px' }}
            variant={'default'}
          />
        )}
      </div>
    </div>
  );
});

WriteFile.displayName = 'WriteFileIntervention';

export default WriteFile;
