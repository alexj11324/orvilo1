import type { ProjectHealth, ProjectUpdate, ProjectUpdateKind } from '@orvilo/types';

import { removeDraft, saveDraft } from '@/features/ChatInput/draftStorage';

export const PROJECT_UPDATE_HEALTH_ORDER: ProjectHealth[] = ['onTrack', 'atRisk', 'offTrack'];

export interface ProjectUpdateDraft {
  body: string;
  health: ProjectHealth;
  mode: ProjectUpdateKind;
}

/** One draft per user, project and composer target (a posted row or the new-update composer). */
export const projectUpdateDraftKey = (
  userId: string | undefined,
  projectId: string,
  updateId?: string,
): string => `project-update:${userId ?? 'local'}:${projectId}:${updateId ?? 'new'}`;

/**
 * Initial composer state. A stored draft wins over the row being edited, except
 * for `kind`, which is immutable once posted. Stored values are untrusted
 * localStorage content, so each field is validated before use.
 */
export const resolveProjectUpdateDraft = (
  stored: Record<string, unknown> | undefined,
  editingUpdate: Pick<ProjectUpdate, 'body' | 'health' | 'kind'> | undefined,
  defaultMode: ProjectUpdateKind,
): ProjectUpdateDraft => {
  const { body, health, mode } = stored ?? {};
  return {
    body: typeof body === 'string' ? body : (editingUpdate?.body ?? ''),
    health: PROJECT_UPDATE_HEALTH_ORDER.includes(health as ProjectHealth)
      ? (health as ProjectHealth)
      : (editingUpdate?.health ?? 'onTrack'),
    mode: editingUpdate?.kind ?? (mode === 'comment' || mode === 'update' ? mode : defaultMode),
  };
};

/** An empty body clears the draft instead of storing a blank one. */
export const persistProjectUpdateDraft = (key: string, draft: ProjectUpdateDraft): void => {
  if (draft.body.trim()) saveDraft(key, { ...draft });
  else removeDraft(key);
};
