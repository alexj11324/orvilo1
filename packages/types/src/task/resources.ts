/** External issue Resources, separate from execution deliveries and editor links. */
export type TaskResourceKind = 'link' | 'pull_request';

/** Exact description contents observed at a committed issue revision. */
export interface TaskDescriptionSnapshot {
  editorData: unknown;
  instruction: string;
}

export type TaskDescriptionCaptureSource = 'baseline' | 'edit';

/** Reusable issue definition; execution state is deliberately absent. */
export interface TaskIssueTemplateDefinition extends TaskDescriptionSnapshot {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  description?: string | null;
  labelIds: string[];
  name: string | null;
  priority: number | null;
  projectId: string | null;
  teamId: string | null;
}

export type TaskIssueRecurrenceCadence = 'day' | 'week' | 'month' | 'year';
