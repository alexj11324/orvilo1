'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import type { ExecuteCodeState } from '../../../types';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow: hidden;
    padding-inline: 8px 0;
  `,
}));

interface ExecuteCodeParams {
  code: string;
  language?: 'javascript' | 'python' | 'typescript';
}

const ExecuteCode = memo<BuiltinRenderProps<ExecuteCodeParams, ExecuteCodeState>>(
  ({ args, pluginState }) => {
    const language = args.language || 'python';

    return (
      <div className={cx('flex flex-col gap-2', styles.container)}>
        <div className="rounded-md border bg-card flex flex-col" style={{ gap: 8, padding: 8 }}>
          <CodeBlock
            wrap
            code={args.code}
            language={language}
            style={{ maxHeight: 200, overflow: 'auto', paddingInline: 8 }}
            variant={'ghost'}
          />
          {pluginState?.output && (
            <CodeBlock
              wrap
              code={pluginState.output}
              language={'text'}
              style={{ maxHeight: 200, overflow: 'auto', paddingInline: 8 }}
              variant={'default'}
            />
          )}
          {pluginState?.stderr && (
            <CodeBlock wrap code={pluginState.stderr} language={'text'} variant={'default'} />
          )}
        </div>
      </div>
    );
  },
);

ExecuteCode.displayName = 'ExecuteCode';

export default ExecuteCode;
