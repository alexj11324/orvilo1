'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useMemo } from 'react';

import { CodeBlock } from '@/components/ui/code-block';

import {
  getGithubOutput,
  type GithubRunCommandArgs,
  type GithubRunCommandState,
  normalizeGhCommand,
  tryParseJson,
} from './utils';

const styles = createStaticStyles(({ css, cssVar }) => ({
  exitCode: css`
    margin-inline-start: 8px;
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
  `,
  exitCodeError: css`
    color: ${cssVar.colorError};
  `,
  exitCodeSuccess: css`
    color: ${cssVar.colorSuccess};
  `,
  sectionLabel: css`
    margin-block-end: 4px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

const GithubRunCommandRender = memo<
  BuiltinRenderProps<GithubRunCommandArgs, GithubRunCommandState>
>(({ args, content, pluginState }) => {
  const rawCommand = args?.command || '';
  const normalized = normalizeGhCommand(rawCommand);

  const output = getGithubOutput(pluginState, content);
  const stderr = pluginState?.stderr || '';
  const exitCode = pluginState?.exitCode;
  const success = pluginState?.success ?? (exitCode === undefined ? undefined : exitCode === 0);

  const { language: outputLanguage, body: outputBody } = useMemo(() => {
    const parsed = tryParseJson(output);
    if (parsed !== undefined) {
      return { body: JSON.stringify(parsed, null, 2), language: 'json' as const };
    }
    return { body: output, language: 'text' as const };
  }, [output]);

  if (!normalized && !output && !stderr) return null;

  return (
    <div className="flex flex-col gap-3">
      {normalized && (
        <div>
          <div className={styles.sectionLabel}>
            Command
            {success !== undefined && (
              <span
                className={`${styles.exitCode} ${
                  success ? styles.exitCodeSuccess : styles.exitCodeError
                }`}
              >
                exit {exitCode ?? (success ? 0 : 1)}
              </span>
            )}
          </div>
          <CodeBlock
            wrap
            code={`gh ${normalized}`}
            language={'sh'}
            style={{ maxHeight: 160, overflow: 'auto', paddingInline: 8 }}
            variant="ghost"
          />
        </div>
      )}
      {outputBody && (
        <div>
          <div className={styles.sectionLabel}>Output</div>
          <CodeBlock
            wrap
            code={outputBody}
            language={outputLanguage}
            style={{ maxHeight: 360, overflow: 'auto', paddingInline: 8 }}
            variant="ghost"
          />
        </div>
      )}
      {stderr && (
        <div>
          <div className={styles.sectionLabel} style={{ color: cssVar.colorError }}>
            Stderr
          </div>
          <CodeBlock
            wrap
            code={stderr}
            language={'text'}
            style={{ maxHeight: 200, overflow: 'auto', paddingInline: 8 }}
            variant="ghost"
          />
        </div>
      )}
    </div>
  );
});

GithubRunCommandRender.displayName = 'GithubRunCommandRender';

export default GithubRunCommandRender;
