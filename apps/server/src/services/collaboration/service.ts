import { eq } from 'drizzle-orm';

import type { CollaborationRoom, RoomAuthorization, RoomSnapshotResult } from '@orvilo/types';
import { roomKey } from '@orvilo/types';
import type { LobeChatDatabase } from '@/database/type';

import { users, WorkspaceMemberModel } from './contractTables';
import { actorColorForId, assertRoomAccess } from './roomAuthz';
import { gatewayConnectUrl } from './roomPublisher';
import { buildRoomSnapshot } from './snapshot';
import { signRoomTicket } from './ticket';

/**
 * Room authorization and snapshot facade. The router stays thin: it supplies
 * the verified session context, this service re-derives everything else —
 * room access, the actor identity, ticket claims — from the database.
 */
export class CollaborationService {
  private readonly db: LobeChatDatabase;
  private readonly userId: string;
  private readonly workspaceId: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  /**
   * Mint a short-lived, single-room ticket after server-side room authz.
   * The ticket carries the server-derived actor — the gateway will stamp it
   * onto every frame and ignore any actor fields the client supplies.
   */
  authorize = async (room: CollaborationRoom): Promise<RoomAuthorization> => {
    await assertRoomAccess(this.db, { userId: this.userId, workspaceId: this.workspaceId }, room);

    const [profile] = await this.db
      .select({ avatar: users.avatar, fullName: users.fullName, username: users.username })
      .from(users)
      .where(eq(users.id, this.userId))
      .limit(1);

    const member = await new WorkspaceMemberModel(this.db, this.userId).getMember(
      this.workspaceId,
      this.userId,
    );

    const { token, expiresAt } = await signRoomTicket({
      actor: {
        color: actorColorForId(this.userId),
        id: this.userId,
        kind: 'human',
        ...(profile?.avatar ? { avatar: profile.avatar } : {}),
        ...(profile?.fullName || profile?.username
          ? { name: profile.fullName ?? profile.username ?? undefined }
          : {}),
      },
      authzVersion: member?.authzVersion ?? undefined,
      room: roomKey(room),
      workspaceId: this.workspaceId,
    });

    return { expiresAt: new Date(expiresAt).toISOString(), gatewayUrl: gatewayConnectUrl(), token };
  };

  /**
   * Reconnect/polling snapshot: re-checks room access on every call — a stale
   * cursor never extends a removed member's read window.
   */
  snapshot = async (params: {
    cursor?: string;
    room: CollaborationRoom;
  }): Promise<RoomSnapshotResult> => {
    await assertRoomAccess(
      this.db,
      { userId: this.userId, workspaceId: this.workspaceId },
      params.room,
    );

    return buildRoomSnapshot(this.db, {
      aggregateId: params.room.id,
      aggregateType: params.room.scope,
      cursor: params.cursor,
      room: roomKey(params.room),
    });
  };
}
