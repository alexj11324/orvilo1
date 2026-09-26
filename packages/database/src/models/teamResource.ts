import { and, asc, eq, isNotNull, isNull, max } from 'drizzle-orm';

import {
  documents,
  type TeamResourcePlacementItem,
  teamResourcePlacements,
  teamResourceSections,
  teams,
} from '../schemas';
import type { OrviloDatabase } from '../type';

export const TEAM_RESOURCE_SECTION_NOT_FOUND = 'Team resource section not found';
export const TEAM_RESOURCE_TEAM_NOT_FOUND = 'Team not found';
export const TEAM_RESOURCE_NOT_FOUND = 'Team resource not found';
export const TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE = 'Document is not attachable to this team';
export const TEAM_RESOURCE_DOCUMENT_ALREADY_ATTACHED = 'Document is already attached to this team';
export const TEAM_RESOURCE_OWNED_DOCUMENT = 'Team-owned documents cannot be detached';

const normalizeLink = (input: { title?: string; url: string }) => {
  const title = input.title?.trim() ?? '';
  if (title.length > 255)
    throw new Error('Team resource link title must not exceed 255 characters');

  let url: URL;
  try {
    url = new URL(input.url.trim());
  } catch {
    throw new Error('Team resource links require a valid HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Team resource links require an HTTP(S) URL without credentials');
  }
  if (url.href.length > 8192) throw new Error('Team resource link URL is too long');

  return { title, url: url.href };
};

/** Persistent, ordered sections and resource placements for one workspace's teams. */
export class TeamResourceModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId: string,
  ) {}

  private sectionScope(teamId: string, sectionId: string) {
    return and(
      eq(teamResourceSections.id, sectionId),
      eq(teamResourceSections.teamId, teamId),
      eq(teamResourceSections.workspaceId, this.workspaceId),
    );
  }

  private resourceScope(teamId: string, resourceId: string) {
    return and(
      eq(teamResourcePlacements.id, resourceId),
      eq(teamResourcePlacements.teamId, teamId),
      eq(teamResourcePlacements.workspaceId, this.workspaceId),
    );
  }

  private assertSection = async (teamId: string, sectionId?: string | null) => {
    if (!sectionId) return;
    const [section] = await this.db
      .select({ id: teamResourceSections.id })
      .from(teamResourceSections)
      .where(this.sectionScope(teamId, sectionId))
      .limit(1);
    if (!section) throw new Error(TEAM_RESOURCE_SECTION_NOT_FOUND);
  };

  private assertTeam = async (teamId: string) => {
    const [team] = await this.db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.workspaceId, this.workspaceId)))
      .limit(1);
    if (!team) throw new Error(TEAM_RESOURCE_TEAM_NOT_FOUND);
  };

  private nextSectionPosition = async (teamId: string) => {
    const [row] = await this.db
      .select({ position: max(teamResourceSections.position) })
      .from(teamResourceSections)
      .where(
        and(
          eq(teamResourceSections.teamId, teamId),
          eq(teamResourceSections.workspaceId, this.workspaceId),
        ),
      );
    return (row?.position ?? -1) + 1;
  };

  private nextResourcePosition = async (teamId: string, sectionId?: string | null) => {
    const [row] = await this.db
      .select({ position: max(teamResourcePlacements.position) })
      .from(teamResourcePlacements)
      .where(
        and(
          eq(teamResourcePlacements.teamId, teamId),
          eq(teamResourcePlacements.workspaceId, this.workspaceId),
          sectionId
            ? eq(teamResourcePlacements.sectionId, sectionId)
            : isNull(teamResourcePlacements.sectionId),
        ),
      );
    return (row?.position ?? -1) + 1;
  };

  list = async (teamId: string) => {
    const [sections, resources] = await Promise.all([
      this.db
        .select()
        .from(teamResourceSections)
        .where(
          and(
            eq(teamResourceSections.teamId, teamId),
            eq(teamResourceSections.workspaceId, this.workspaceId),
          ),
        )
        .orderBy(asc(teamResourceSections.position), asc(teamResourceSections.id)),
      this.db
        .select()
        .from(teamResourcePlacements)
        .where(
          and(
            eq(teamResourcePlacements.teamId, teamId),
            eq(teamResourcePlacements.workspaceId, this.workspaceId),
          ),
        )
        .orderBy(
          asc(teamResourcePlacements.sectionId),
          asc(teamResourcePlacements.position),
          asc(teamResourcePlacements.id),
        ),
    ]);
    return { resources, sections };
  };

  createSection = async (params: { name: string; position?: number; teamId: string }) => {
    await this.assertTeam(params.teamId);
    const [section] = await this.db
      .insert(teamResourceSections)
      .values({
        createdByUserId: this.userId,
        name: params.name.trim(),
        position: params.position ?? (await this.nextSectionPosition(params.teamId)),
        teamId: params.teamId,
        workspaceId: this.workspaceId,
      })
      .returning();
    return section;
  };

  renameSection = async (teamId: string, sectionId: string, name: string) => {
    const [section] = await this.db
      .update(teamResourceSections)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(this.sectionScope(teamId, sectionId))
      .returning();
    return section ?? null;
  };

  reorderSection = async (teamId: string, sectionId: string, position: number) => {
    const [section] = await this.db
      .update(teamResourceSections)
      .set({ position, updatedAt: new Date() })
      .where(this.sectionScope(teamId, sectionId))
      .returning();
    return section ?? null;
  };

  deleteSection = async (teamId: string, sectionId: string) => {
    const [section] = await this.db
      .delete(teamResourceSections)
      .where(this.sectionScope(teamId, sectionId))
      .returning();
    return section ?? null;
  };

  createLink = async (params: {
    position?: number;
    sectionId?: string | null;
    teamId: string;
    title?: string;
    url: string;
  }) => {
    await this.assertTeam(params.teamId);
    await this.assertSection(params.teamId, params.sectionId);
    const link = normalizeLink(params);
    const [resource] = await this.db
      .insert(teamResourcePlacements)
      .values({
        ...link,
        addedByUserId: this.userId,
        position:
          params.position ?? (await this.nextResourcePosition(params.teamId, params.sectionId)),
        sectionId: params.sectionId ?? null,
        teamId: params.teamId,
        workspaceId: this.workspaceId,
      })
      .returning();
    return resource;
  };

  updateLink = async (
    teamId: string,
    resourceId: string,
    input: { title?: string; url: string },
  ) => {
    const link = normalizeLink(input);
    const [resource] = await this.db
      .update(teamResourcePlacements)
      .set({ ...link, updatedAt: new Date() })
      .where(and(this.resourceScope(teamId, resourceId), isNull(teamResourcePlacements.documentId)))
      .returning();
    return resource ?? null;
  };

  removeLink = async (teamId: string, resourceId: string) => {
    const [resource] = await this.db
      .delete(teamResourcePlacements)
      .where(and(this.resourceScope(teamId, resourceId), isNull(teamResourcePlacements.documentId)))
      .returning();
    return resource ?? null;
  };

  attachDocument = async (params: {
    documentId: string;
    position?: number;
    sectionId?: string | null;
    teamId: string;
  }): Promise<TeamResourcePlacementItem> => {
    await this.assertTeam(params.teamId);
    await this.assertSection(params.teamId, params.sectionId);
    const [document] = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, params.documentId),
          eq(documents.workspaceId, this.workspaceId),
          eq(documents.visibility, 'public'),
        ),
      )
      .limit(1);
    if (!document) throw new Error(TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE);

    const [resource] = await this.db
      .insert(teamResourcePlacements)
      .values({
        addedByUserId: this.userId,
        documentId: document.id,
        position:
          params.position ?? (await this.nextResourcePosition(params.teamId, params.sectionId)),
        sectionId: params.sectionId ?? null,
        teamId: params.teamId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({
        target: [teamResourcePlacements.teamId, teamResourcePlacements.documentId],
        where: isNotNull(teamResourcePlacements.documentId),
      })
      .returning();
    if (!resource) throw new Error(TEAM_RESOURCE_DOCUMENT_ALREADY_ATTACHED);
    return resource;
  };

  placeTeamDocument = async (params: {
    documentId: string;
    position?: number;
    sectionId?: string | null;
    teamId: string;
  }) => {
    await this.assertTeam(params.teamId);
    await this.assertSection(params.teamId, params.sectionId);
    const [document] = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, params.documentId),
          eq(documents.workspaceId, this.workspaceId),
          eq(documents.teamId, params.teamId),
          eq(documents.visibility, 'team'),
        ),
      )
      .limit(1);
    if (!document) throw new Error(TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE);

    const [resource] = await this.db
      .insert(teamResourcePlacements)
      .values({
        addedByUserId: this.userId,
        documentId: document.id,
        position:
          params.position ?? (await this.nextResourcePosition(params.teamId, params.sectionId)),
        sectionId: params.sectionId ?? null,
        teamId: params.teamId,
        workspaceId: this.workspaceId,
      })
      .returning();
    return resource;
  };

  detachDocument = async (teamId: string, resourceId: string) => {
    return this.db.transaction(async (tx) => {
      const [placement] = await tx
        .select({ documentId: teamResourcePlacements.documentId })
        .from(teamResourcePlacements)
        .where(
          and(this.resourceScope(teamId, resourceId), isNotNull(teamResourcePlacements.documentId)),
        )
        .for('update')
        .limit(1);
      if (!placement?.documentId) return null;
      const [document] = await tx
        .select({ teamId: documents.teamId, visibility: documents.visibility })
        .from(documents)
        .where(eq(documents.id, placement.documentId))
        .for('update')
        .limit(1);
      if (document?.visibility === 'team' && document.teamId === teamId) {
        throw new Error(TEAM_RESOURCE_OWNED_DOCUMENT);
      }
      const [resource] = await tx
        .delete(teamResourcePlacements)
        .where(this.resourceScope(teamId, resourceId))
        .returning();
      return resource ?? null;
    });
  };

  moveResource = async (params: {
    position: number;
    resourceId: string;
    sectionId?: string | null;
    teamId: string;
  }) => {
    await this.assertSection(params.teamId, params.sectionId);
    const [resource] = await this.db
      .update(teamResourcePlacements)
      .set({
        position: params.position,
        sectionId: params.sectionId ?? null,
        updatedAt: new Date(),
      })
      .where(this.resourceScope(params.teamId, params.resourceId))
      .returning();
    return resource ?? null;
  };
}
