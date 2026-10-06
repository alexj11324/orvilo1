import type { ReactNode } from 'react';
import { memo } from 'react';

/** Retained for existing callers; task visibility controls are removed. */
interface TaskVisibilityTagProps {
  children?: ReactNode;
  disableDropdown?: boolean;
  lockedReason?: string;
  onChange?: (next: 'private' | 'public') => void;
  size?: number;
  taskIdentifier?: string;
  visibility: 'private' | 'public';
}

const TaskVisibilityTag = memo<TaskVisibilityTagProps>(() => null);

TaskVisibilityTag.displayName = 'TaskVisibilityTag';

export default TaskVisibilityTag;
