import type { WorkQuery, WorkQueryPredicate } from '@orvilo/types';

export const ALL_TEAM_CYCLES = '__all__';

export const teamCyclePredicate = (
  cycleId: string | null | undefined,
): WorkQueryPredicate | undefined => {
  if (!cycleId || cycleId === ALL_TEAM_CYCLES) return undefined;
  return { field: 'cycleId', op: 'eq', value: cycleId };
};

export const teamTaskQuery = (teamId: string, cycleId?: string | null): WorkQuery => {
  const cycle = teamCyclePredicate(cycleId);
  return {
    entityType: 'task',
    filter: {
      all: [{ field: 'teamId', op: 'eq', value: teamId }, ...(cycle ? [cycle] : [])],
    },
    schemaVersion: 1,
  };
};

export const teamTriageQuery = (teamId: string, cycleId?: string | null): WorkQuery => {
  const cycle = teamCyclePredicate(cycleId);
  return {
    entityType: 'task',
    filter: {
      all: [
        { field: 'teamId', op: 'eq', value: teamId },
        { field: 'triageStatus', op: 'eq', value: 'untriaged' },
        ...(cycle ? [cycle] : []),
      ],
    },
    schemaVersion: 1,
  };
};
