import { describe, expect, it } from 'vitest';

import { assertLocalParityDatabase } from '../seedParityVolume';
import {
  VOLUME_APPROVALS,
  VOLUME_COMMENTS,
  VOLUME_FAVORITES,
  VOLUME_NOTIFICATIONS,
  VOLUME_PROJECTS,
  VOLUME_SAVED_VIEWS,
  VOLUME_SUBSCRIBED_TASK_IDS,
  VOLUME_TASK_EDGES,
  VOLUME_TASKS,
  VOLUME_TEAM,
} from '../seedParityVolume.data';

const LOCAL_URL_SCHEMES = ['postgres://', 'postgresql://'];
const LOCAL_DB = 'localhost:5432/orvilo_linear_parity_20260922';

describe('assertLocalParityDatabase', () => {
  it.each(LOCAL_URL_SCHEMES)('accepts %s against the local parity database', (scheme) => {
    expect(() => assertLocalParityDatabase(`${scheme}user:pass@${LOCAL_DB}`)).not.toThrow();
  });

  it.each([
    'mysql://user:pass@localhost:5432/orvilo_linear_parity_20260922',
    'postgres://user:pass@remote-host:5432/orvilo_linear_parity_20260922',
    'postgres://user:pass@localhost:5433/orvilo_linear_parity_20260922',
    'postgres://user:pass@localhost:5432/other_database',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => assertLocalParityDatabase(url)).toThrow();
  });
});

describe('volume project specs', () => {
  it('seeds at least four projects with dates, milestones and dependencies', () => {
    expect(VOLUME_PROJECTS.length).toBeGreaterThanOrEqual(4);
    for (const project of VOLUME_PROJECTS) {
      expect(project.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(project.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(project.milestones.length).toBeGreaterThanOrEqual(1);
      expect(project.identifier.length).toBeGreaterThanOrEqual(3);
      expect(project.identifier.length).toBeLessThanOrEqual(6);
      // project_milestones.name is NOT NULL since migration 0189
      for (const milestone of project.milestones) {
        expect(milestone.name.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every project inside the fixture dependency graph', () => {
    const knownSlugs = new Set(['parity-test-project', ...VOLUME_PROJECTS.map((p) => p.slug)]);
    for (const project of VOLUME_PROJECTS) {
      expect(project.dependencies.length).toBeGreaterThanOrEqual(1);
      for (const dep of project.dependencies) {
        expect(knownSlugs.has(dep.slug)).toBe(true);
        expect(dep.slug).not.toBe(project.slug);
      }
    }
  });

  it('uses unique slugs and identifiers', () => {
    const slugs = VOLUME_PROJECTS.map((p) => p.slug);
    const identifiers = VOLUME_PROJECTS.map((p) => p.identifier);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });
});

describe('volume task specs', () => {
  const taskIds = new Set(VOLUME_TASKS.map((t) => t.id));
  const projectSlugs = new Set(VOLUME_PROJECTS.map((p) => p.slug));

  it('seeds at least 30 tasks with unique ids and identifiers', () => {
    expect(VOLUME_TASKS.length).toBeGreaterThanOrEqual(30);
    expect(taskIds.size).toBe(VOLUME_TASKS.length);
    const identifiers = VOLUME_TASKS.map((t) => t.identifier);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('keeps parent, project, milestone and edge references resolvable', () => {
    for (const task of VOLUME_TASKS) {
      if (task.parentId) expect(taskIds.has(task.parentId)).toBe(true);
      if (task.projectSlug) expect(projectSlugs.has(task.projectSlug)).toBe(true);
      if (task.milestone !== undefined && task.projectSlug) {
        const project = VOLUME_PROJECTS.find((p) => p.slug === task.projectSlug);
        expect(project).toBeDefined();
        expect(project!.milestones.length).toBeGreaterThan(task.milestone);
      }
    }
    for (const edge of VOLUME_TASK_EDGES) {
      expect(taskIds.has(edge.taskId)).toBe(true);
      expect(taskIds.has(edge.dependsOnId)).toBe(true);
      expect(edge.taskId).not.toBe(edge.dependsOnId);
    }
  });

  it('models sub-issue trees at least two levels deep', () => {
    const children = new Map<string, number>();
    for (const task of VOLUME_TASKS) {
      if (!task.parentId) continue;
      children.set(task.parentId, (children.get(task.parentId) ?? 0) + 1);
      // a parent that itself has a parent = depth ≥ 3 chain exists somewhere
    }
    const depth3 = VOLUME_TASKS.some(
      (task) => task.parentId && VOLUME_TASKS.some((p) => p.id === task.parentId && p.parentId),
    );
    expect(depth3).toBe(true);
    expect(children.size).toBeGreaterThanOrEqual(4);
  });

  it('populates triage, review, urgent and canceled lanes', () => {
    const untriaged = VOLUME_TASKS.filter((t) => t.untriaged);
    expect(untriaged.length).toBeGreaterThanOrEqual(3);
    for (const task of untriaged) {
      expect(task.category).toBe('triage');
    }
    const inReview = VOLUME_TASKS.filter((t) => t.category === 'in_review');
    expect(inReview.length).toBeGreaterThanOrEqual(3);
    for (const task of inReview) {
      expect(task.review).toBe(true);
      expect(task.status).toBe('paused');
    }
    expect(VOLUME_TASKS.some((t) => t.priority === 1 && t.status !== 'canceled')).toBe(true);
    expect(VOLUME_TASKS.some((t) => t.category === 'canceled')).toBe(true);
    // second-team coverage: Voyager tasks ride SHIP workflow states
    expect(VOLUME_TASKS.some((t) => t.teamKey === VOLUME_TEAM.key)).toBe(true);
  });
});

describe('volume review + inbox specs', () => {
  const taskIds = new Set(VOLUME_TASKS.map((t) => t.id));
  const approvalIds = new Set(VOLUME_APPROVALS.map((a) => a.id));

  it('seeds pending task and pull-request approvals', () => {
    const taskReviews = VOLUME_APPROVALS.filter((a) => a.actionType === 'task_review');
    const prReviews = VOLUME_APPROVALS.filter((a) => a.actionType === 'pull_request_review');
    expect(taskReviews.length).toBeGreaterThanOrEqual(2);
    expect(prReviews.length).toBeGreaterThanOrEqual(1);
    for (const approval of taskReviews) {
      expect(approval.targetType).toBe('task');
      expect(taskIds.has(approval.targetId)).toBe(true);
    }
    for (const approval of prReviews) {
      expect(approval.targetType).toBe('github_pull_request');
      expect(approval.targetId).toMatch(/^https:\/\/github\.com\//);
    }
    // at least one approval lands in the "For you" tab (approverUserId = me)
    expect(VOLUME_APPROVALS.some((a) => a.approverUserId === 'me')).toBe(true);
  });

  it('keeps notification dedupe keys unique and action links resolvable', () => {
    const keys = VOLUME_NOTIFICATIONS.map((n) => n.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const notification of VOLUME_NOTIFICATIONS) {
      expect(notification.dedupeKey.startsWith('linear-parity-volume:')).toBe(true);
      if (notification.actionRequestId) {
        expect(approvalIds.has(notification.actionRequestId)).toBe(true);
      }
      if (notification.resourceType === 'task') {
        expect(taskIds.has(notification.resourceId!)).toBe(true);
      }
    }
  });
});

describe('volume view and favorite specs', () => {
  it('references only seeded targets', () => {
    const viewIds = new Set(VOLUME_SAVED_VIEWS.map((v) => v.id));
    const slugs = new Set(VOLUME_PROJECTS.map((p) => p.slug));
    for (const favorite of VOLUME_FAVORITES) {
      if (favorite.targetType === 'project') expect(slugs.has(favorite.targetSlug)).toBe(true);
      if (favorite.targetType === 'savedView') expect(viewIds.has(favorite.savedViewId)).toBe(true);
    }
    const taskIds = new Set(VOLUME_TASKS.map((t) => t.id));
    for (const taskId of VOLUME_SUBSCRIBED_TASK_IDS) expect(taskIds.has(taskId)).toBe(true);
    for (const comment of VOLUME_COMMENTS) expect(taskIds.has(comment.taskId)).toBe(true);
  });
});
