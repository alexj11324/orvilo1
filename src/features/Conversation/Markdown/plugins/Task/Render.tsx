import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { ClipboardList } from 'lucide-react';
import { memo, useMemo } from 'react';

import { type MarkdownElementProps } from '../type';
import { useTaskCardScope } from './context';
import { type ParsedTaskContent, parseTaskContent } from './parseTaskContent';

const styles = createStaticStyles(({ css, cssVar }) => ({
  divider: css`
    inline-size: 100%;
    block-size: 1px;
    background: ${cssVar.colorSplit};
  `,
  fallback: css`
    overflow: auto;

    padding-block: 12px;
    padding-inline: 14px;
    border: 1px dashed ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: pre-wrap;
  `,
  fieldKey: css`
    flex: none;
    min-inline-size: 64px;
    color: ${cssVar.colorTextTertiary};
  `,
  fieldRow: css`
    font-size: 13px;
    line-height: 1.6;
  `,
  fieldValue: css`
    color: ${cssVar.colorTextSecondary};
    word-break: break-word;
  `,
  headerIcon: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    inline-size: 32px;
    block-size: 32px;

    color: ${cssVar.colorTextSecondary};
  `,
  identifier: css`
    flex: none;

    padding-block: 1px;
    padding-inline: 6px;
    border-radius: 4px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  instruction: css`
    font-size: 13px;
    line-height: 1.7;
    color: ${cssVar.colorText};
    white-space: pre-wrap;
  `,
  rawList: css`
    margin: 0;
    padding: 0;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};
    list-style: none;

    li {
      white-space: pre-wrap;
    }
  `,
  section: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};

    summary {
      cursor: pointer;
      padding-block: 4px;
      color: ${cssVar.colorTextSecondary};

      &:hover {
        color: ${cssVar.colorText};
      }
    }
  `,
}));

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
      <summary>
        {label} ({items.length})
      </summary>
      <ul className={styles.rawList}>
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
  const enabled = useTaskCardScope();
  const text = typeof children === 'string' ? children : String(children ?? '');
  const parsed = useMemo<ParsedTaskContent>(() => parseTaskContent(text), [text]);

  if (!enabled) {
    return <pre className={styles.fallback}>{text}</pre>;
  }

  const titleText = parsed.name || parsed.identifier || '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={styles.headerIcon}>
          <ClipboardList size={16} />
        </span>
        <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            {parsed.identifier && <span className={styles.identifier}>{parsed.identifier}</span>}
            <div className="truncate font-medium" style={{ flex: 1, minWidth: 0 }}>
              {titleText}
            </div>
          </div>
        </div>
      </div>

      {parsed.instruction && (
        <>
          <div className={styles.divider} />
          <div className="flex flex-col gap-1">
            <div className="text-[12px] text-muted-foreground">Instruction</div>
            <div className={styles.instruction}>{parsed.instruction}</div>
          </div>
        </>
      )}

      {(parsed.description || parsed.dependencies || parsed.review) && (
        <div className="flex flex-col gap-1">
          <FieldRow label="Description" value={parsed.description} />
          <FieldRow label="Dependencies" value={parsed.dependencies} />
          <FieldRow label="Review" value={parsed.review} />
        </div>
      )}

      {(parsed.subtasks?.length ||
        parsed.activities?.length ||
        parsed.workspace?.length ||
        parsed.reviewRubrics?.length) && (
        <div className="flex flex-col gap-1">
          <RawSection items={parsed.subtasks ?? []} label="Subtasks" />
          <RawSection items={parsed.activities ?? []} label="Activities" />
          <RawSection items={parsed.workspace ?? []} label="Workspace" />
          <RawSection items={parsed.reviewRubrics ?? []} label="Review rubrics" />
        </div>
      )}
    </div>
  );
});

Render.displayName = 'TaskRender';

export default Render;
