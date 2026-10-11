import { type ConnectionConfig } from '@lobehub/market-types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
  CodeBlockTitle,
} from '@/components/ui/code-block';
import { genServerConfig } from '@/features/MCP/utils';

interface PlatformProps {
  connection?: ConnectionConfig;
  identifier?: string;
  lite?: boolean;
  mobile?: boolean;
}

const Platform = memo<PlatformProps>(({ lite, identifier, connection }) => {
  const { t } = useTranslation('discover');
  const serverConfig = genServerConfig(identifier, connection);

  return (
    <div className={cn('flex flex-col p-1', lite ? 'gap-0' : 'gap-4')}>
      <CodeBlock
        className="text-xs"
        code={serverConfig}
        label={t('mcp.details.deployment.serverConfig')}
        language="json"
      >
        <CodeBlockHeader>
          <CodeBlockTitle className="flex-1">
            {t('mcp.details.deployment.serverConfig')}
          </CodeBlockTitle>
          <CodeBlockLanguage />
          <CodeBlockCopyButton />
        </CodeBlockHeader>
        <CodeBlockContent className={lite ? '[&_pre]:p-3' : undefined} />
      </CodeBlock>
    </div>
  );
});

export default Platform;
