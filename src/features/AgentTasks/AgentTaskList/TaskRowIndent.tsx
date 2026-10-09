import { createStaticStyles } from 'antd-style';
import type { ReactNode } from 'react';

/**
 * Indent added per nesting level, in px — Linear's measured 24px: a child's
 * priority mark sits 24px right of its parent's. The elbow connector (12px +
 * 4px gap) is part of the first step.
 */
const INDENT_STEP = 24;
const CONNECTOR_SPAN = 16;

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    // Elbow drawn from the row's top edge down to its vertical centre, so a
    // child reads as hanging off the row above it rather than off the group.
    connector: css`
      position: relative;

      flex: none;
      align-self: stretch;

      inline-size: 12px;
      margin-inline-end: 4px;

      &::before {
        content: '';

        position: absolute;
        inset-block: 0 50%;
        inset-inline-start: 0;

        inline-size: 8px;
        border-block-end: 1px solid ${cssVar.colorBorder};
        border-inline-start: 1px solid ${cssVar.colorBorder};
        border-end-start-radius: 4px;
      }
    `,
    // Context-only rows are dimmed without fading the text: a row-level opacity
    // took the secondary text to ~2.1:1 on light. The title steps down to the
    // secondary text role (the identifier/date are already there, ~5.7:1) and only
    // the glyphs and avatars, which carry no text, are faded.
    muted: css`
      color: ${cssVar.colorTextSecondary};

      & svg,
      & [data-slot='avatar'],
      & .orvilo-avatar {
        opacity: 0.5;
      }
    `,
  };
});

interface TaskRowIndentProps {
  children: ReactNode;
  /** Nesting level of the row; 0 renders the task untouched. */
  depth: number;
  /**
   * Dims the row to mark it as context only — the task is shown to place a
   * nested child, not because it belongs to this group.
   */
  muted?: boolean;
}

const TaskRowIndent = ({ children, depth, muted }: TaskRowIndentProps) => {
  if (depth <= 0 && !muted) return <>{children}</>;

  return (
    <div
      className={muted ? `flex items-stretch ${styles.muted}` : 'flex items-stretch'}
      style={depth > 0 ? { paddingInlineStart: depth * INDENT_STEP - CONNECTOR_SPAN } : undefined}
    >
      {depth > 0 && <div className={styles.connector} />}
      <div className="flex-1" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
};

export default TaskRowIndent;
