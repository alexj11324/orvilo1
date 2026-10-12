import { cn } from 'cn';
import { ClipboardList } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import referenceStyles from '../ReferenceRender.module.css';
import { type MarkdownElementProps } from '../type';
import { useTaskCardScope } from './context';
import { type ParsedTaskContent, parseTaskContent } from './parseTaskContent';

const styles = {
  divider: 'w-full h-px bg-divider',
  fieldKey: 'flex-none min-w-16 text-foreground-tertiary',
  fieldRow: 'text-sm leading-5.5',
  fieldValue: 'text-muted-foreground [word-break:break-word]',
  headerIcon: 'flex flex-none items-center justify-center size-8 text-muted-foreground',
  identifier:
    'flex-none py-0.25 px-1.5 rounded-(--radius-chip) font-mono text-xs leading-5 text-muted-foreground bg-fill-quaternary',
  instruction: 'text-sm leading-5.5 text-foreground whitespace-pre-wrap',
  section:
    'text-xs leading-5 text-foreground-tertiary [&_summary]:cursor-pointer [&_summary]:py-1 [&_summary]:text-muted-foreground [&_summary:hover]:text-foreground',
};

const FieldRow = memo<{ label: string; value?: string }>(({ label, value }) => {
  if (!value) return null;
  return (
    <div className={cn('flex gap-2', styles.fieldRow)}>
      <span className={styles.fieldKey}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
});

const RawSection = memo<{ items: string[]; label: string }>(({ items, label }) => {
  if (!items || items.length === 0) return null;
  return (
    <details className={styles.section}>
      <summary data-slot="markdown-task-summary">
        {label} ({items.length})
      </summary>
      <ul className={referenceStyles.taskRawList} data-slot="markdown-task-raw-list">
        {items.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    </details>
  );
});

interface TaskRenderProps extends MarkdownElementProps {
  raw?: string;
}

const Render = memo<TaskRenderProps>(({ children }) => {
  const { t } = useTranslation('chat');
  const enabled = useTaskCardScope();
  const text = typeof children === 'string' ? children : String(children ?? '');
  const parsed = useMemo<ParsedTaskContent>(() => parseTaskContent(text), [text]);

  if (!enabled) {
    return (
      <pre className={referenceStyles.taskFallback} data-slot="markdown-task-fallback">
        {text}
      </pre>
    );
  }

  const titleText = parsed.name || parsed.identifier || '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={styles.headerIcon}>
          <ClipboardList size={16} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {parsed.identifier && <span className={styles.identifier}>{parsed.identifier}</span>}
            <div className="min-w-0 flex-1 truncate text-sm leading-5.5 font-medium">
              {titleText}
            </div>
          </div>
        </div>
      </div>

      {parsed.instruction && (
        <>
          <div className={styles.divider} />
          <div className="flex flex-col gap-1">
            <div className="text-xs leading-5 text-muted-foreground">
              {t('task.card.instruction')}
            </div>
            <div className={styles.instruction}>{parsed.instruction}</div>
          </div>
        </>
      )}

      {(parsed.description || parsed.dependencies || parsed.review) && (
        <div className="flex flex-col gap-1">
          <FieldRow label={t('task.card.description')} value={parsed.description} />
          <FieldRow label={t('task.card.dependencies')} value={parsed.dependencies} />
          <FieldRow label={t('task.card.review')} value={parsed.review} />
        </div>
      )}

      {(parsed.subtasks?.length ||
        parsed.activities?.length ||
        parsed.workspace?.length ||
        parsed.reviewRubrics?.length) && (
        <div className="flex flex-col gap-1">
          <RawSection items={parsed.subtasks ?? []} label={t('task.card.subtasks')} />
          <RawSection items={parsed.activities ?? []} label={t('task.card.activities')} />
          <RawSection items={parsed.workspace ?? []} label={t('task.card.workspace')} />
          <RawSection items={parsed.reviewRubrics ?? []} label={t('task.card.reviewRubrics')} />
        </div>
      )}
    </div>
  );
});

Render.displayName = 'TaskRender';

export default Render;
