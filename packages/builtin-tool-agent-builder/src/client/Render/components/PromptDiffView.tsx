'use client';

import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { createTwoFilesPatch } from 'diff';
import { CheckCircle, FileText } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock, parseUnifiedDiff } from '@/components/ui/code-block';

const MAX_FALLBACK_LENGTH = 500;

/**
 * Prompts are not files, so the "No newline at end of file" marker CodeDiff emits
 * for content without a trailing newline is pure noise. Worse, when only one side
 * ends with a newline the last line shows up as deleted + re-added. Normalising
 * both sides to end with exactly one newline keeps the diff about the words.
 */
const withTrailingNewline = (value: string) =>
  value === '' || value.endsWith('\n') ? value : `${value}\n`;

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    font-size: 13px;
  `,
  diffCard: css`
    overflow: auto;

    max-height: 400px;
    margin-inline-start: 12px;
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
  `,
  fileIcon: css`
    color: ${cssVar.colorTextTertiary};
  `,
  promptCard: css`
    margin-inline-start: 12px;
    padding: 12px;
    border-inline-start: 3px solid ${cssVar.colorSuccess};
    background: ${cssVar.colorFillTertiary};
  `,
  promptContent: css`
    overflow: auto;

    max-height: 200px;
    margin-inline: -12px;
    margin-inline-start: 20px;
    padding-inline: 12px;

    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorText};
    word-break: break-word;
    white-space: pre-wrap;
  `,
  promptLabel: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
  statusRow: css`
    margin-block-end: 6px;
    margin-inline-start: 9px;
    color: ${cssVar.colorSuccess};
  `,
  statusText: css`
    font-weight: 500;
  `,
}));

export interface PromptDiffViewProps {
  /**
   * The prompt after the update. Empty string means the prompt was cleared.
   */
  newPrompt?: string;
  /**
   * The prompt before the update. `undefined` means the tool result predates
   * `previousPrompt` being recorded, in which case only the new prompt is shown.
   */
  previousPrompt?: string;
}

/**
 * Shared read-only snapshot for "update system prompt" style tool calls.
 * Renders a unified diff between the previous and new prompt so users can see
 * exactly what changed instead of re-reading the whole prompt.
 */
const PromptDiffView = memo<PromptDiffViewProps>(({ newPrompt = '', previousPrompt }) => {
  const { t } = useTranslation('plugin');

  const hasDiff = previousPrompt !== undefined && previousPrompt !== newPrompt;
  const isUnchanged = previousPrompt !== undefined && previousPrompt === newPrompt;

  const statusKey = isUnchanged
    ? 'builtins.orvilo-agent-builder.render.updatePrompt.unchanged'
    : newPrompt
      ? 'builtins.orvilo-agent-builder.render.updatePrompt.updated'
      : 'builtins.orvilo-agent-builder.render.updatePrompt.cleared';

  return (
    <div className={cn('flex', 'flex-col', 'gap-2', styles.container)}>
      <div className={cn('flex', 'items-center', 'gap-[6px]', styles.statusRow)}>
        <CheckCircle size={14} />
        <span className={styles.statusText}>{t(statusKey)}</span>
      </div>

      {hasDiff && (
        <div className={styles.diffCard}>
          {parseUnifiedDiff(
            createTwoFilesPatch(
              'a/prompt.md',
              'b/prompt.md',
              withTrailingNewline(previousPrompt),
              withTrailingNewline(newPrompt),
            ),
          ).map((file) => (
            <CodeBlock key={file.file} language={'markdown'} lines={file.lines} variant="ghost" />
          ))}
        </div>
      )}

      {/* Legacy tool results without `previousPrompt`: fall back to a truncated preview */}
      {!hasDiff && !isUnchanged && newPrompt && (
        <div className={cn('flex', 'flex-col', 'gap-2', styles.promptCard)}>
          <div className="flex items-center gap-[6px]">
            <FileText className={styles.fileIcon} size={14} />
            <span className={styles.promptLabel}>
              {t('builtins.orvilo-agent-builder.render.updatePrompt.newPrompt', {
                count: newPrompt.length,
              })}
            </span>
          </div>
          <div className={styles.promptContent}>
            {newPrompt.length > MAX_FALLBACK_LENGTH
              ? newPrompt.slice(0, MAX_FALLBACK_LENGTH) + '...'
              : newPrompt}
          </div>
        </div>
      )}
    </div>
  );
});

PromptDiffView.displayName = 'PromptDiffView';

export default PromptDiffView;
