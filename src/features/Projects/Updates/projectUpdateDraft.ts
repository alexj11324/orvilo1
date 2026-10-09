import type { ProjectHealth, ProjectUpdate, ProjectUpdateKind } from '@orvilo/types';

import { getDraft, removeDraft, saveDraft } from '@/features/ChatInput/draftStorage';

export const PROJECT_UPDATE_HEALTH_ORDER: ProjectHealth[] = ['onTrack', 'atRisk', 'offTrack'];

const DEFAULT_HEALTH: ProjectHealth = 'onTrack';

export interface ProjectUpdateDraft {
  body: string;
  health: ProjectHealth;
  mode: ProjectUpdateKind;
}

type SavedProjectUpdate = Pick<ProjectUpdate, 'body' | 'health' | 'kind'>;

interface ProjectUpdateDraftScope {
  projectId: string;
  /** The posted row being edited; omitted for the new-update composer. */
  updateId?: string;
  userId: string | null | undefined;
  /** `null` is explicit personal mode, which is its own scope. */
  workspaceId: string | null | undefined;
}

/**
 * Draft key scoped to the signed-in user, the active workspace, the project and
 * the composer target. Example: user A's unsent update must not appear when
 * user B signs in on the same device. Without a user there is no key, and
 * nothing is read or written.
 */
export const projectUpdateDraftKey = ({
  projectId,
  updateId,
  userId,
  workspaceId,
}: ProjectUpdateDraftScope): string | undefined => {
  if (!userId || !projectId) return undefined;

  return [
    'project-update',
    'user',
    encodeURIComponent(userId),
    workspaceId ? `workspace:${encodeURIComponent(workspaceId)}` : 'personal',
    'project',
    encodeURIComponent(projectId),
    encodeURIComponent(updateId ?? 'new'),
  ].join(':');
};

export const readProjectUpdateDraft = (
  key: string | undefined,
): Record<string, unknown> | undefined => (key ? getDraft(key) : undefined);

/**
 * Initial composer state. A stored draft wins over the row being edited, except
 * for `kind`, which is immutable once posted. Stored values are untrusted
 * localStorage content, so each field is validated before use.
 */
export const resolveProjectUpdateDraft = (
  stored: Record<string, unknown> | undefined,
  editingUpdate: SavedProjectUpdate | undefined,
  defaultMode: ProjectUpdateKind,
): ProjectUpdateDraft => {
  const { body, health, mode } = stored ?? {};
  return {
    body: typeof body === 'string' ? body : (editingUpdate?.body ?? ''),
    health: PROJECT_UPDATE_HEALTH_ORDER.includes(health as ProjectHealth)
      ? (health as ProjectHealth)
      : (editingUpdate?.health ?? DEFAULT_HEALTH),
    mode: editingUpdate?.kind ?? (mode === 'comment' || mode === 'update' ? mode : defaultMode),
  };
};

/** Whether the composer holds anything the saved record does not already have. */
const hasUnsavedChanges = (
  draft: ProjectUpdateDraft,
  saved: SavedProjectUpdate | undefined,
): boolean => {
  if (!draft.body.trim()) return false;
  if (!saved) return true;
  if (draft.body.trim() !== saved.body.trim()) return true;
  // Comments carry no health, so only an update row can differ by it.
  return draft.mode === 'update' && draft.health !== (saved.health ?? DEFAULT_HEALTH);
};

/**
 * Store the draft only while it differs from the saved record; otherwise clear
 * it, so opening and closing a posted row leaves no copy of it behind.
 */
export const persistProjectUpdateDraft = (
  key: string | undefined,
  draft: ProjectUpdateDraft,
  saved?: SavedProjectUpdate,
): void => {
  if (!key) return;
  if (hasUnsavedChanges(draft, saved)) saveDraft(key, { ...draft });
  else removeDraft(key);
};

/** Drop the draft once the edit is cancelled or the update is saved. */
export const clearProjectUpdateDraft = (key: string | undefined): void => {
  if (key) removeDraft(key);
};
