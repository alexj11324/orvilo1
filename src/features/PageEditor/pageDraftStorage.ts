import debug from 'debug';

const log = debug('page:draft');

const DRAFT_KEY_PREFIX = 'page-draft:';
export const DRAFT_WRITE_DEBOUNCE_MS = 200;
/**
 * Drafts older than 24h are treated as stale on open. Past that window the
 * server is almost certainly the source of truth (someone else has edited, or
 * the user has moved on) and silently restoring would be more surprising than
 * helpful.
 */
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PageDraftPayload {
  documentId: string;
  editorData: unknown;
  ownerId?: string;
  savedAt: string;
}

const draftKey = (documentId: string) => `${DRAFT_KEY_PREFIX}${documentId}`;

export const writeDraft = (payload: PageDraftPayload): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(draftKey(payload.documentId), JSON.stringify(payload));
  } catch (error) {
    // sessionStorage may be full / blocked — drop silently. The in-memory editor
    // still has the content; the snapshot is defense in depth, not the primary
    // copy.
    log('failed to write draft for %s: %O', payload.documentId, error);
  }
};

export const clearPageDraft = (documentId: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(draftKey(documentId));
  } catch {
    // ignore
  }
};

export const readPageDraft = (documentId: string): PageDraftPayload | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(draftKey(documentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PageDraftPayload;
    if (parsed?.documentId !== documentId) return null;
    const savedAt = Date.parse(parsed.savedAt);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > DRAFT_MAX_AGE_MS) {
      clearPageDraft(documentId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
