import { afterEach, describe, expect, it } from 'vitest';

import {
  anchorPointInOverlay,
  COLLAB_ID_ATTR,
  COLLAB_PRIVATE_ATTR,
  collabAnchorFor,
  collabIdFor,
  collabIdForTarget,
  parseCollabId,
  pointToUV,
} from './anchors';

describe('collabIdFor / collabIdForTarget', () => {
  it('builds bare ids for card anchors and suffixed ids for fields', () => {
    expect(collabIdFor('task', 't-1')).toBe('task:t-1');
    expect(collabIdFor('task', 't-1', 'card')).toBe('task:t-1');
    expect(collabIdFor('task', 't-1', 'status')).toBe('task:t-1:status');
    expect(collabIdFor('project', 'p-9', 'assignee')).toBe('project:p-9:assignee');
  });

  it('collabIdForTarget collapses card anchors to the bare entity', () => {
    expect(collabIdForTarget({ anchor: 'card', entityId: 't-1', entityType: 'task' })).toBe(
      'task:t-1',
    );
    expect(collabIdForTarget({ anchor: 'status', entityId: 't-1', entityType: 'task' })).toBe(
      'task:t-1:status',
    );
  });
});

describe('parseCollabId', () => {
  it('parses entity ids and recognised anchors', () => {
    expect(parseCollabId('task:t-1')).toEqual({ entityId: 't-1', entityType: 'task' });
    expect(parseCollabId('task:t-1:status')).toEqual({
      anchor: 'status',
      entityId: 't-1',
      entityType: 'task',
    });
  });

  it('keeps colons inside the entity id when the tail is not a known anchor', () => {
    expect(parseCollabId('task:urn:task:42')).toEqual({
      entityId: 'urn:task:42',
      entityType: 'task',
    });
    expect(parseCollabId('task:urn:task:42:assignee')).toEqual({
      anchor: 'assignee',
      entityId: 'urn:task:42',
      entityType: 'task',
    });
  });

  it('rejects malformed ids', () => {
    expect(parseCollabId('nocolon')).toBeNull();
    expect(parseCollabId(':id')).toBeNull();
  });

  it('round-trips with collabIdFor', () => {
    for (const id of ['task:abc', 'task:abc:status', 'project:p-1:assignee']) {
      const parsed = parseCollabId(id);
      expect(parsed).not.toBeNull();
      expect(collabIdFor(parsed!.entityType, parsed!.entityId, parsed!.anchor)).toBe(id);
    }
  });
});

describe('anchorPointInOverlay / pointToUV', () => {
  const rect = { height: 100, left: 50, top: 200, width: 200 };

  it('projects the centre of the rect', () => {
    expect(anchorPointInOverlay(rect, 0.5, 0.5)).toEqual({ x: 150, y: 250 });
  });

  it('projects rect corners', () => {
    expect(anchorPointInOverlay(rect, 0, 0)).toEqual({ x: 50, y: 200 });
    expect(anchorPointInOverlay(rect, 1, 1)).toEqual({ x: 250, y: 300 });
  });

  it('offsets by the overlay rect so both live in one coordinate space', () => {
    const overlay = { left: 30, top: 40 };
    expect(anchorPointInOverlay(rect, 0.5, 0.5, overlay)).toEqual({ x: 120, y: 210 });
  });

  it('pointToUV is the exact inverse of anchorPointInOverlay', () => {
    const point = anchorPointInOverlay(rect, 0.25, 0.75);
    const uv = pointToUV(point, rect);
    expect(uv.u).toBeCloseTo(0.25);
    expect(uv.v).toBeCloseTo(0.75);
  });

  it('clamps out-of-range pointers to the rect edge', () => {
    expect(pointToUV({ x: -500, y: 999_999 }, rect)).toEqual({ u: 0, v: 1 });
  });

  it('returns 0 for zero-size rects instead of dividing by zero', () => {
    const flat = { height: 0, left: 10, top: 10, width: 0 };
    expect(pointToUV({ x: 50, y: 50 }, flat)).toEqual({ u: 0, v: 0 });
  });
});

describe('collabAnchorFor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const cardWith = (attrs: Record<string, string>) => {
    const card = document.createElement('div');
    card.setAttribute(COLLAB_ID_ATTR, 'task:t-1');
    const status = document.createElement('span');
    status.setAttribute(COLLAB_ID_ATTR, 'task:t-1:status');
    card.append(status);
    document.body.append(card);
    for (const [name, value] of Object.entries(attrs)) card.setAttribute(name, value);
    return { card, status };
  };

  it('resolves the nearest anchor element and its id', () => {
    const { status } = cardWith({});
    const hit = collabAnchorFor(status);
    expect(hit?.collabId).toBe('task:t-1:status');
    expect(hit?.anchorEl).toBe(status);
  });

  it('returns null for unanchored targets', () => {
    const plain = document.createElement('div');
    document.body.append(plain);
    expect(collabAnchorFor(plain)).toBeNull();
    expect(collabAnchorFor(null)).toBeNull();
  });

  it('never resolves anchors inside a private-marked subtree', () => {
    const { card, status } = cardWith({ [COLLAB_PRIVATE_ATTR]: 'true' });
    // Nested anchors share the suppression — the collab id embeds the entity
    // id, which must stay off the wire for private tasks.
    expect(collabAnchorFor(status)).toBeNull();
    expect(collabAnchorFor(card)).toBeNull();
  });

  it('suppresses anchors when the private marker sits on an ancestor wrapper', () => {
    const { card, status } = cardWith({});
    const privateWrap = document.createElement('div');
    privateWrap.setAttribute(COLLAB_PRIVATE_ATTR, 'true');
    card.replaceWith(privateWrap);
    privateWrap.append(card);
    expect(collabAnchorFor(status)).toBeNull();
    expect(collabAnchorFor(card)).toBeNull();
  });

  it('does not suppress anchors in sibling subtrees', () => {
    const { status } = cardWith({});
    const privateWrap = document.createElement('div');
    privateWrap.setAttribute(COLLAB_PRIVATE_ATTR, 'true');
    document.body.append(privateWrap);
    expect(collabAnchorFor(status)?.collabId).toBe('task:t-1:status');
  });
});
