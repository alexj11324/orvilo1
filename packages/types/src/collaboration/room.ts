/**
 * Logical realtime scope a client joins. Naming a room grants nothing —
 * `collaboration.authorize` decides access server-side and the ticket is the
 * only proof the gateway accepts.
 */
export const COLLABORATION_ROOM_SCOPES = ['workspace', 'project', 'task'] as const;

export type CollaborationRoomScope = (typeof COLLABORATION_ROOM_SCOPES)[number];

export interface CollaborationRoom {
  id: string;
  scope: CollaborationRoomScope;
}

/**
 * Canonical wire form of a room: `{scope}:{id}` (e.g. `task:task_abc`).
 * Room ids never contain ':' in this system (idGenerator prefixes use '_').
 */
export const roomKey = (room: CollaborationRoom): string => `${room.scope}:${room.id}`;

export const parseRoomKey = (key: string): CollaborationRoom | null => {
  const separator = key.indexOf(':');
  if (separator <= 0) return null;

  const scope = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (!id || !(COLLABORATION_ROOM_SCOPES as readonly string[]).includes(scope)) return null;

  return { id, scope: scope as CollaborationRoomScope };
};
