import type { WorkQuery, WorkQueryEntityType } from '@orvilo/types';

export type ParsedWorkQueryDraft =
  | { ok: false; reason: 'empty' | 'invalid_json' | 'invalid_query' }
  | { ok: true; query: WorkQuery };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isWorkQueryDraft = (value: unknown): value is WorkQuery => {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (value.entityType !== 'task' && value.entityType !== 'project') return false;
  if (value.filter !== undefined && !isRecord(value.filter)) return false;
  return true;
};

export const stringifyWorkQueryDraft = (query: WorkQuery): string => JSON.stringify(query, null, 2);

export const parseWorkQueryDraft = (text: string): ParsedWorkQueryDraft => {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (!isWorkQueryDraft(parsed)) return { ok: false, reason: 'invalid_query' };
  return { ok: true, query: parsed };
};

export const workQueryFromDraft = (
  text: string,
  entityType: WorkQueryEntityType,
): WorkQuery | null => {
  const parsed = parseWorkQueryDraft(text);
  if (!parsed.ok) return null;
  return { ...parsed.query, entityType };
};
