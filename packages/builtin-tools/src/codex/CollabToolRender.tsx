'use client';
import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { CodexCollabToolArgs, CodexCollabToolState } from './collabToolUtils';
import {
  formatCollabStatus,
  getCollabAgentEntries,
  getCollabPrompt,
  getCollabStatusTone,
} from './collabToolUtils';

const styles = createStaticStyles(({ css, cssVar }) => ({
  agentHeader: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  agentRow: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillQuaternary};
  `,
  promptBox: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillTertiary};
  `,
  sectionLabel: css`
    margin-block-end: 4px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  statusDot: css`
    flex: none;

    width: 6px;
    height: 6px;
    border-radius: 50%;

    background: ${cssVar.colorTextQuaternary};
  `,
  statusDotError: css`
    background: ${cssVar.colorError};
  `,
  statusDotProcessing: css`
    background: ${cssVar.colorInfo};
  `,
  statusDotSuccess: css`
    background: ${cssVar.colorSuccess};
  `,
}));

const STATUS_DOT_CLASS = {
  error: styles.statusDotError,
  muted: undefined,
  processing: styles.statusDotProcessing,
  success: styles.statusDotSuccess,
};

const CollabToolRender = memo<
  BuiltinRenderProps<CodexCollabToolArgs, CodexCollabToolState, string>
>(({ args, pluginState }) => {
  const { t } = useTranslation('plugin');
  const prompt = getCollabPrompt(args, pluginState);
  const agents = getCollabAgentEntries(args, pluginState);

  if (!prompt && agents.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {prompt && (
        <div>
          <div className={styles.sectionLabel}>
            {t('builtins.codex.collabTool.instruction', { defaultValue: 'Instruction' })}
          </div>
          <div className={cn('flex', 'flex-col', styles.promptBox)}>
            <Markdown style={{ maxHeight: 240, overflow: 'auto' }} variant={'chat'}>
              {prompt}
            </Markdown>
          </div>
        </div>
      )}
      {agents.length > 0 && (
        <div>
          <div className={styles.sectionLabel}>
            {t('builtins.codex.collabTool.agents', { defaultValue: 'Subagents' })}
          </div>
          <div className="flex flex-col gap-2">
            {agents.map((agent, index) => (
              <div className={cn('flex', 'flex-col', 'gap-1', styles.agentRow)} key={agent.id}>
                <div className={cn('flex', 'items-center', 'gap-[6px]', styles.agentHeader)}>
                  <span
                    className={cx(
                      styles.statusDot,
                      STATUS_DOT_CLASS[getCollabStatusTone(agent.status)],
                    )}
                  />
                  <span>
                    {t('builtins.codex.collabTool.agentLabel', {
                      defaultValue: 'Subagent {{index}}',
                      index: index + 1,
                    })}
                  </span>
                  {agent.status && <span>· {formatCollabStatus(agent.status)}</span>}
                </div>
                {agent.message && (
                  <Markdown style={{ maxHeight: 320, overflow: 'auto' }} variant={'chat'}>
                    {agent.message}
                  </Markdown>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

CollabToolRender.displayName = 'CodexCollabToolRender';

export default CollabToolRender;
