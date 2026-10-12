import type { ReactNode } from 'react';

/**
 * Indent added per nesting level, in px — Linear's measured 24px: a child's
 * priority mark sits 24px right of its parent's. The elbow connector (12px +
 * 4px gap) is part of the first step.
 */
const INDENT_STEP = 24;
const CONNECTOR_SPAN = 16;

const styles = {
  connector:
    "relative flex-none self-stretch [inline-size:--spacing(3)] me-1 before:content-[''] before:absolute before:[inset-block:0_50%] before:start-0 before:[inline-size:--spacing(2)] before:border-be before:border-s before:border-border before:[border-end-start-radius:--spacing(1)]",
  muted: 'text-muted-foreground',
};

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
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
};

export default TaskRowIndent;
