'use client';

import { type BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import { CodeBlock } from '@/components/reui/code-block/code-block';

import type { ExecScriptParams, ExecScriptState } from '../../../types';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow: hidden;
    padding-inline: 8px 0;
  `,
}));

const ExecScript = memo<BuiltinRenderProps<ExecScriptParams, ExecScriptState>>(
  ({ args, content, pluginState }) => {
    const { command } = pluginState || {};

    return (
      <div className={cx('flex flex-col gap-2', styles.container)}>
        <div className="rounded-md border bg-card flex flex-col" style={{ gap: 8, padding: 8 }}>
          <CodeBlock
            wrap
            code={args?.command || command || ''}
            language={'sh'}
            style={{ paddingInline: 8 }}
            variant={'ghost'}
          />
          {content && <CodeBlock wrap code={content} language={'text'} variant={'default'} />}
        </div>
      </div>
    );
  },
);

export default ExecScript;
