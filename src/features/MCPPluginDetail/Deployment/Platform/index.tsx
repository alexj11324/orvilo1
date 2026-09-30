import { type ConnectionConfig } from '@lobehub/market-types';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import { CodeBlock } from '@/components/ui/code-block';
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
  const serverConfig = genServerConfig(identifier, connection);

  return (
    <div className="flex flex-col p-1" style={{ gap: lite ? 0 : 16 }}>
      <CodeBlock
        className={cx(lite && styles.lite)}
        code={serverConfig}
        label="MCP server config"
        language="json"
        style={{
          fontSize: 12,
        }}
      />
    </div>
  );
});

export default Platform;
