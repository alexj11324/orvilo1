'use client';

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
    <div className={cn('flex', 'flex-col', 'gap-2', 'text-[13px]')}>
      <div
        className={cn(
          'flex',
          'items-center',
          'gap-[6px]',
          'ms-[9px] [margin-block-end:6px] text-success',
        )}
      >
        <CheckCircle size={14} />
        <span className="font-medium">{t(statusKey)}</span>
      </div>

      {hasDiff && (
        <div className="ms-3 max-h-[400px] overflow-auto rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)]">
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
        <div
          className={cn(
            'flex',
            'flex-col',
            'gap-2',
            'ms-3 border-s-[3px] border-success bg-accent p-3',
          )}
        >
          <div className="flex items-center gap-[6px]">
            <FileText className="text-[var(--ant-color-text-tertiary)]" size={14} />
            <span className="text-xs leading-[inherit] font-medium text-muted-foreground">
              {t('builtins.orvilo-agent-builder.render.updatePrompt.newPrompt', {
                count: newPrompt.length,
              })}
            </span>
          </div>
          <div className="ms-5 -me-3 max-h-[200px] overflow-auto ps-3 pe-3 text-[13px] leading-[1.6] text-foreground [word-break:break-word] whitespace-pre-wrap">
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
