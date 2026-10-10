'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type {
  AddTaskCommentParams,
  AddTaskCommentState,
  DeleteTaskCommentParams,
  DeleteTaskCommentState,
  UpdateTaskCommentParams,
  UpdateTaskCommentState,
} from '../../../types';
import { TaskApiName } from '../../../types';

const styles = {
  chip: 'inline-flex min-w-0 max-w-[220px] shrink items-center truncate rounded-[999px] bg-accent px-2 py-px text-[12px] font-mono text-muted-foreground ms-1.5',
  contentChip:
    'inline-flex min-w-0 max-w-[260px] shrink items-center truncate rounded-[999px] bg-accent px-2 py-px text-[12px] text-foreground ms-1.5',
};

interface TaskCommentInspectorProps extends BuiltinInspectorProps<
  AddTaskCommentParams | UpdateTaskCommentParams | DeleteTaskCommentParams,
  AddTaskCommentState | UpdateTaskCommentState | DeleteTaskCommentState
> {
  apiName: string;
}

const selectLabelKey = (apiName: string) => {
  switch (apiName) {
    case TaskApiName.addTaskComment: {
      return 'builtins.orvilo-task.apiName.addTaskComment';
    }
    case TaskApiName.updateTaskComment: {
      return 'builtins.orvilo-task.apiName.updateTaskComment';
    }
    case TaskApiName.deleteTaskComment: {
      return 'builtins.orvilo-task.apiName.deleteTaskComment';
    }
    default: {
      return 'builtins.orvilo-task.apiName.addTaskComment';
    }
  }
};

export const TaskCommentInspector = memo<TaskCommentInspectorProps>(
  ({ apiName, args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');

    const params = args || partialArgs || {};
    const identifier = 'identifier' in params ? params.identifier : undefined;
    const commentId = 'commentId' in params ? params.commentId : undefined;
    const content = 'content' in params ? params.content : undefined;

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {t(selectLabelKey(apiName))}
        </span>
        {identifier && <span className={styles.chip}>{identifier}</span>}
        {commentId && <span className={styles.chip}>{commentId}</span>}
        {content && <span className={styles.contentChip}>{content}</span>}
      </div>
    );
  },
);

TaskCommentInspector.displayName = 'TaskCommentInspector';

export const AddTaskCommentInspector = (
  props: BuiltinInspectorProps<AddTaskCommentParams, AddTaskCommentState>,
) => <TaskCommentInspector {...props} apiName={TaskApiName.addTaskComment} />;
AddTaskCommentInspector.displayName = 'AddTaskCommentInspector';

export const UpdateTaskCommentInspector = (
  props: BuiltinInspectorProps<UpdateTaskCommentParams, UpdateTaskCommentState>,
) => <TaskCommentInspector {...props} apiName={TaskApiName.updateTaskComment} />;
UpdateTaskCommentInspector.displayName = 'UpdateTaskCommentInspector';

export const DeleteTaskCommentInspector = (
  props: BuiltinInspectorProps<DeleteTaskCommentParams, DeleteTaskCommentState>,
) => <TaskCommentInspector {...props} apiName={TaskApiName.deleteTaskComment} />;
DeleteTaskCommentInspector.displayName = 'DeleteTaskCommentInspector';
