import { type ConnectionConfig } from '@lobehub/market-types';
import { createStaticStyles, cx } from 'antd-style';
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

const styles = createStaticStyles(({ css }) => {
  return {
    lite: css`
      pre {
        padding: 12px !important;
      }
    `,
  };
});

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
    <div className="flex flex-col p-1" style={{ gap: lite ? 0 : 16 }}>
      <CodeBlock
        className={cx(lite && styles.lite)}
        code={serverConfig}
        label={t('mcp.details.deployment.serverConfig')}
        language="json"
        style={{
          fontSize: 12,
        }}
      >
        <CodeBlockHeader>
          <CodeBlockTitle className="flex-1">
            {t('mcp.details.deployment.serverConfig')}
          </CodeBlockTitle>
          <CodeBlockLanguage />
          <CodeBlockCopyButton />
        </CodeBlockHeader>
        <CodeBlockContent />
      </CodeBlock>
    </div>
  );
});

export default Platform;
