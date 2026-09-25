/**
 * Data specs for the Linear parity volume seed — kept separate from
 * `seedParityVolume.ts` so the orchestration file stays readable.
 * Every constant is deterministic: fixed ids, keys, slugs and dedupe
 * prefixes make the seed replayable.
 */
import type {
  NotificationMetadata,
  ProjectHealth,
  ProjectPriority,
  ProjectStatus,
  TaskActivityLogPayload,
  TaskActivityLogType,
  TaskStatus,
  TaskWorkflowCategory,
  WorkQuery,
} from '@orvilo/types';

export const FIXTURE_DEDUPE_PREFIX = 'linear-parity-volume:';

/** Deterministic uuids in a block that never collides with generated rows. */
export const volUuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const DAY = 24 * 60 * 60 * 1000;
export const NOW = Date.now();
export const daysAgo = (n: number) => new Date(NOW - n * DAY);

export const VOLUME_TEAM = { key: 'SHIP', name: 'Parity Shipping' } as const;

export const VOLUME_WORKFLOW_REMOTE_PREFIX = 'parity-ship-workflow-';

export const VOLUME_CYCLE = {
  endsAt: new Date(NOW + 7 * DAY),
  name: 'Parity Cycle 42',
  number: 42,
  remoteCycleId: 'parity-volume-cycle-42',
  startsAt: new Date(NOW - 7 * DAY),
} as const;

/* ── Projects ──────────────────────────────────────────────────────────── */

export interface VolumeProjectSpec {
  dependencies: { slug: string; type: 'blockedBy' | 'blocking' }[];
  description: string;
  health?: ProjectHealth;
  identifier: string;
  labels: string[];
  links: { title: string; url: string }[];
  milestones: { date: string; description?: string; name: string }[];
  name: string;
  priority: ProjectPriority;
  slug: string;
  startDate: string;
  status: ProjectStatus;
  summary: string;
  targetDate: string;
  teamKey: 'PARITY' | 'SHIP';
  updates: { body: string; health?: ProjectHealth; kind?: 'comment' | 'update' }[];
}

export const VOLUME_PROJECTS: readonly VolumeProjectSpec[] = [
  {
    dependencies: [{ slug: 'parity-test-project', type: 'blockedBy' }],
    description:
      'Synthetic platform program. Ships the shared workspace shell every other parity ' +
      'project depends on — exercises a lead, milestones, labels, links and a blockedBy edge.',
    health: 'onTrack',
    identifier: 'APX',
    labels: ['Platform', 'Backend'],
    links: [
      {
        title: 'PR: Apollo shell rollout',
        url: 'https://github.com/alexj11324/orvilo/pull/118',
      },
      {
        title: 'PR: workspace chrome alignment',
        url: 'https://github.com/alexj11324/orvilo/pull/121',
      },
    ],
    milestones: [
      {
        date: '2026-09-30',
        description: 'Schema + shell contracts frozen',
        name: 'APX M1 — Foundations',
      },
      {
        date: '2026-10-31',
        description: 'Services integrated end to end',
        name: 'APX M2 — Integration',
      },
      {
        date: '2026-11-30',
        description: 'Load + failure drills complete',
        name: 'APX M3 — Hardening',
      },
    ],
    name: 'Apollo Platform',
    priority: 2,
    slug: 'parity-apollo-platform',
    startDate: '2026-08-15',
    status: 'active',
    summary: 'Shared platform workstream for the parity fixture.',
    targetDate: '2026-11-30',
    teamKey: 'PARITY',
    updates: [
      {
        body: 'M1 closed on schedule; M2 integration points are all claimed.',
        health: 'onTrack',
        kind: 'update',
      },
      {
        body: 'Watching the APX-6 review queue — it gates M3 scope.',
        kind: 'comment',
      },
    ],
  },
  {
    dependencies: [{ slug: 'parity-apollo-platform', type: 'blocking' }],
    description:
      'Synthetic launch program owned by the shipping team. It gates Apollo — the timeline ' +
      'renders it as an upstream predecessor.',
    identifier: 'VYG',
    labels: ['Launch'],
    links: [
      {
        title: 'PR: launch checklist automation',
        url: 'https://github.com/alexj11324/orvilo/pull/140',
      },
    ],
    milestones: [
      { date: '2027-01-31', name: 'VYG M1 — Readiness' },
      { date: '2027-02-28', name: 'VYG M2 — General availability' },
    ],
    name: 'Voyager Launch',
    priority: 1,
    slug: 'parity-voyager-launch',
    startDate: '2026-12-01',
    status: 'planned',
    summary: 'Launch-track fixture project under the second fixture team.',
    targetDate: '2027-02-28',
    teamKey: 'SHIP',
    updates: [
      {
        body: 'Scope drafted; waiting on Apollo milestones before locking the launch train.',
        kind: 'comment',
      },
    ],
  },
  {
    dependencies: [{ slug: 'parity-apollo-platform', type: 'blockedBy' }],
    description:
      'Synthetic data-migration program. Currently paused behind Apollo — renders the paused ' +
      'board column and an at-risk health pill.',
    health: 'atRisk',
    identifier: 'MRC',
    labels: ['Backend', 'Migration'],
    links: [
      {
        title: 'PR: migration dry-run harness',
        url: 'https://github.com/alexj11324/orvilo/pull/132',
      },
    ],
    milestones: [
      { date: '2026-11-15', name: 'MRC M1 — Schema freeze' },
      { date: '2026-12-20', name: 'MRC M2 — Data move' },
    ],
    name: 'Mercury Migration',
    priority: 3,
    slug: 'parity-mercury-migration',
    startDate: '2026-10-01',
    status: 'paused',
    summary: 'Migration fixture parked behind Apollo platform work.',
    targetDate: '2027-01-15',
    teamKey: 'PARITY',
    updates: [
      {
        body: 'Paused until APX M2 lands; schema freeze slipped one milestone.',
        health: 'atRisk',
        kind: 'update',
      },
    ],
  },
  {
    dependencies: [{ slug: 'parity-apollo-platform', type: 'blockedBy' }],
    description:
      'Synthetic decommission program. Canceled mid-flight so the projects board keeps a ' +
      'populated canceled column.',
    identifier: 'ORB',
    labels: ['Tooling'],
    links: [],
    milestones: [{ date: '2026-08-01', name: 'ORB M1 — Read-only cutover' }],
    name: 'Orbital Archive',
    priority: 4,
    slug: 'parity-orbital-archive',
    startDate: '2026-06-01',
    status: 'canceled',
    summary: 'Canceled fixture project.',
    targetDate: '2026-08-01',
    teamKey: 'PARITY',
    updates: [],
  },
];

/* ── Tasks ─────────────────────────────────────────────────────────────── */

export interface VolumeTaskSpec {
  /** Assign the fixture user. */
  assignee?: boolean;
  category: TaskWorkflowCategory;
  /** Attach the PARITY cycle. */
  cycle?: boolean;
  daysOld: number;
  description?: string;
  error?: string;
  id: string;
  identifier: string;
  /** Milestone sortOrder inside the owning project; undefined = no milestone. */
  milestone?: number;
  name: string;
  parentId?: string;
  priority?: number;
  projectSlug?: string;
  /** reviewerUserId = fixture user (drives the Reviews surface). */
  review?: boolean;
  status: TaskStatus;
  teamKey: 'PARITY' | 'SHIP';
  /** triageStatus = 'untriaged' (drives Team Triage). */
  untriaged?: boolean;
}

const t = (spec: VolumeTaskSpec) => spec;

export const VOLUME_TASKS: readonly VolumeTaskSpec[] = [
  // ── Apollo Platform (PARITY) — 12 tasks, 3-level tree, review pair, urgent/blocking edge
  t({
    category: 'done',
    daysOld: 21,
    id: 'task_pv0001',
    identifier: 'APX-1',
    milestone: 0,
    name: 'Apollo: scope platform boundaries',
    projectSlug: 'parity-apollo-platform',
    status: 'completed',
    teamKey: 'PARITY',
  }),
  t({
    category: 'done',
    daysOld: 20,
    id: 'task_pv0002',
    identifier: 'APX-2',
    milestone: 0,
    name: 'Apollo: freeze schema contract',
    parentId: 'task_pv0001',
    projectSlug: 'parity-apollo-platform',
    status: 'completed',
    teamKey: 'PARITY',
  }),
  t({
    assignee: true,
    category: 'in_progress',
    cycle: true,
    daysOld: 12,
    description: 'Integration work tracked inside the active parity cycle.',
    id: 'task_pv0003',
    identifier: 'APX-3',
    milestone: 1,
    name: 'Apollo: integrate workspace shell',
    priority: 2,
    projectSlug: 'parity-apollo-platform',
    status: 'running',
    teamKey: 'PARITY',
  }),
  t({
    assignee: true,
    category: 'in_progress',
    cycle: true,
    daysOld: 10,
    id: 'task_pv0004',
    identifier: 'APX-4',
    milestone: 1,
    name: 'Apollo: wire navigation bridge',
    parentId: 'task_pv0003',
    projectSlug: 'parity-apollo-platform',
    status: 'running',
    teamKey: 'PARITY',
  }),
  t({
    category: 'todo',
    cycle: true,
    daysOld: 9,
    id: 'task_pv0005',
    identifier: 'APX-5',
    milestone: 1,
    name: 'Apollo: shell regression sweep',
    parentId: 'task_pv0004',
    projectSlug: 'parity-apollo-platform',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    assignee: true,
    category: 'in_review',
    daysOld: 6,
    description: 'In review — the Reviews surface picks this up via reviewerUserId.',
    id: 'task_pv0006',
    identifier: 'APX-6',
    milestone: 1,
    name: 'Apollo: review inbox batch mutations',
    priority: 2,
    projectSlug: 'parity-apollo-platform',
    review: true,
    status: 'paused',
    teamKey: 'PARITY',
  }),
  t({
    assignee: true,
    category: 'in_review',
    daysOld: 5,
    id: 'task_pv0007',
    identifier: 'APX-7',
    milestone: 1,
    name: 'Apollo: review board keyboard flow',
    projectSlug: 'parity-apollo-platform',
    review: true,
    status: 'paused',
    teamKey: 'PARITY',
  }),
  t({
    assignee: true,
    category: 'todo',
    daysOld: 4,
    id: 'task_pv0008',
    identifier: 'APX-8',
    milestone: 2,
    name: 'Apollo: urgent — harden token refresh path',
    priority: 1,
    projectSlug: 'parity-apollo-platform',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    category: 'todo',
    daysOld: 4,
    id: 'task_pv0009',
    identifier: 'APX-9',
    milestone: 2,
    name: 'Apollo: rotate staging credentials',
    projectSlug: 'parity-apollo-platform',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    category: 'backlog',
    daysOld: 3,
    id: 'task_pv0010',
    identifier: 'APX-10',
    name: 'Apollo: backlog — audit log retention',
    projectSlug: 'parity-apollo-platform',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    category: 'canceled',
    daysOld: 8,
    id: 'task_pv0011',
    identifier: 'APX-11',
    milestone: 2,
    name: 'Apollo: canceled duplicate of shell audit',
    projectSlug: 'parity-apollo-platform',
    status: 'canceled',
    teamKey: 'PARITY',
  }),
  t({
    category: 'in_progress',
    daysOld: 2,
    error: 'Synthetic failure evidence: parity runner exited on contract mismatch.',
    id: 'task_pv0012',
    identifier: 'APX-12',
    milestone: 2,
    name: 'Apollo: failed contract replay run',
    projectSlug: 'parity-apollo-platform',
    status: 'failed',
    teamKey: 'PARITY',
  }),

  // ── Mercury Migration (PARITY) — 8 tasks, 3-level tree, cross-project dep
  t({
    assignee: true,
    category: 'todo',
    daysOld: 15,
    id: 'task_pv0013',
    identifier: 'MRC-1',
    milestone: 0,
    name: 'Mercury: map legacy tables',
    priority: 2,
    projectSlug: 'parity-mercury-migration',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    category: 'todo',
    daysOld: 14,
    id: 'task_pv0014',
    identifier: 'MRC-2',
    milestone: 0,
    name: 'Mercury: draft mapping sheet',
    parentId: 'task_pv0013',
    projectSlug: 'parity-mercury-migration',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    category: 'backlog',
    daysOld: 13,
    id: 'task_pv0015',
    identifier: 'MRC-3',
    milestone: 0,
    name: 'Mercury: validate row counters',
    parentId: 'task_pv0014',
    projectSlug: 'parity-mercury-migration',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    assignee: true,
    category: 'in_progress',
    daysOld: 7,
    id: 'task_pv0016',
    identifier: 'MRC-4',
    milestone: 1,
    name: 'Mercury: dry-run migration harness',
    projectSlug: 'parity-mercury-migration',
    status: 'running',
    teamKey: 'PARITY',
  }),
  t({
    category: 'backlog',
    daysOld: 6,
    id: 'task_pv0017',
    identifier: 'MRC-5',
    milestone: 1,
    name: 'Mercury: cutover rollback plan',
    projectSlug: 'parity-mercury-migration',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    category: 'done',
    daysOld: 18,
    id: 'task_pv0018',
    identifier: 'MRC-6',
    milestone: 0,
    name: 'Mercury: inventory source databases',
    projectSlug: 'parity-mercury-migration',
    status: 'completed',
    teamKey: 'PARITY',
  }),
  t({
    category: 'todo',
    daysOld: 5,
    id: 'task_pv0019',
    identifier: 'MRC-7',
    name: 'Mercury: schedule rehearsal window',
    projectSlug: 'parity-mercury-migration',
    status: 'scheduled',
    teamKey: 'PARITY',
  }),
  t({
    category: 'todo',
    daysOld: 3,
    id: 'task_pv0020',
    identifier: 'MRC-8',
    name: 'Mercury: no-milestone cleanup notes',
    projectSlug: 'parity-mercury-migration',
    status: 'backlog',
    teamKey: 'PARITY',
  }),

  // ── Voyager Launch (SHIP) — 6 tasks, second-team coverage
  t({
    assignee: true,
    category: 'todo',
    daysOld: 11,
    id: 'task_pv0021',
    identifier: 'VYG-1',
    milestone: 0,
    name: 'Voyager: assemble launch checklist',
    priority: 2,
    projectSlug: 'parity-voyager-launch',
    status: 'backlog',
    teamKey: 'SHIP',
  }),
  t({
    category: 'in_progress',
    daysOld: 9,
    id: 'task_pv0022',
    identifier: 'VYG-2',
    milestone: 0,
    name: 'Voyager: draft go/no-go criteria',
    parentId: 'task_pv0021',
    projectSlug: 'parity-voyager-launch',
    status: 'running',
    teamKey: 'SHIP',
  }),
  t({
    category: 'backlog',
    daysOld: 8,
    id: 'task_pv0023',
    identifier: 'VYG-3',
    milestone: 0,
    name: 'Voyager: comms plan skeleton',
    projectSlug: 'parity-voyager-launch',
    status: 'backlog',
    teamKey: 'SHIP',
  }),
  t({
    assignee: true,
    category: 'in_review',
    daysOld: 4,
    id: 'task_pv0024',
    identifier: 'VYG-4',
    milestone: 1,
    name: 'Voyager: review readiness report',
    projectSlug: 'parity-voyager-launch',
    review: true,
    status: 'paused',
    teamKey: 'SHIP',
  }),
  t({
    category: 'done',
    daysOld: 16,
    id: 'task_pv0025',
    identifier: 'VYG-5',
    milestone: 1,
    name: 'Voyager: name the release train',
    projectSlug: 'parity-voyager-launch',
    status: 'completed',
    teamKey: 'SHIP',
  }),
  t({
    category: 'backlog',
    daysOld: 2,
    id: 'task_pv0026',
    identifier: 'VYG-6',
    name: 'Voyager: backlog — post-launch retro outline',
    priority: 3,
    projectSlug: 'parity-voyager-launch',
    status: 'backlog',
    teamKey: 'SHIP',
  }),

  // ── Orbital Archive (PARITY) — canceled project tasks
  t({
    category: 'canceled',
    daysOld: 30,
    id: 'task_pv0027',
    identifier: 'ORB-1',
    milestone: 0,
    name: 'Orbital: canceled read-only mirror',
    projectSlug: 'parity-orbital-archive',
    status: 'canceled',
    teamKey: 'PARITY',
  }),
  t({
    category: 'canceled',
    daysOld: 29,
    id: 'task_pv0028',
    identifier: 'ORB-2',
    name: 'Orbital: canceled export tooling spike',
    projectSlug: 'parity-orbital-archive',
    status: 'canceled',
    teamKey: 'PARITY',
  }),

  // ── PARITY projectless — triage queue (Team Triage surface)
  t({
    category: 'triage',
    daysOld: 1,
    id: 'task_pv0029',
    identifier: 'PARITY-1',
    name: 'Triage: investigate flaky inbox badge count',
    priority: 2,
    status: 'backlog',
    teamKey: 'PARITY',
    untriaged: true,
  }),
  t({
    category: 'triage',
    daysOld: 1,
    id: 'task_pv0030',
    identifier: 'PARITY-2',
    name: 'Triage: board drag glitch on week view',
    priority: 1,
    status: 'backlog',
    teamKey: 'PARITY',
    untriaged: true,
  }),
  t({
    category: 'triage',
    daysOld: 0,
    id: 'task_pv0031',
    identifier: 'PARITY-3',
    name: 'Triage: evaluate sync retry budget',
    status: 'backlog',
    teamKey: 'PARITY',
    untriaged: true,
  }),
  t({
    category: 'triage',
    daysOld: 0,
    id: 'task_pv0032',
    identifier: 'PARITY-4',
    name: 'Triage: split badge count reproduction steps',
    parentId: 'task_pv0029',
    status: 'backlog',
    teamKey: 'PARITY',
    untriaged: true,
  }),

  // ── PARITY projectless — review queue + ordinary rows
  t({
    assignee: true,
    category: 'in_review',
    daysOld: 3,
    description: 'Pending human review — surfaced under Reviews → For you.',
    id: 'task_pv0033',
    identifier: 'PARITY-5',
    name: 'Review: inbox batch mutation results',
    priority: 2,
    review: true,
    status: 'paused',
    teamKey: 'PARITY',
  }),
  t({
    assignee: true,
    category: 'in_review',
    daysOld: 2,
    id: 'task_pv0034',
    identifier: 'PARITY-6',
    name: 'Review: board keyboard navigation notes',
    review: true,
    status: 'paused',
    teamKey: 'PARITY',
  }),
  t({
    category: 'in_review',
    daysOld: 2,
    id: 'task_pv0035',
    identifier: 'PARITY-7',
    name: 'Review: migration dry-run output',
    review: true,
    status: 'paused',
    teamKey: 'PARITY',
  }),
  t({
    assignee: true,
    category: 'todo',
    cycle: true,
    daysOld: 6,
    id: 'task_pv0036',
    identifier: 'PARITY-8',
    name: 'Write parity acceptance notes',
    priority: 3,
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    category: 'backlog',
    daysOld: 5,
    id: 'task_pv0037',
    identifier: 'PARITY-9',
    name: 'Update onboarding copy for parity workspace',
    status: 'backlog',
    teamKey: 'PARITY',
  }),
  t({
    category: 'canceled',
    daysOld: 25,
    id: 'task_pv0038',
    identifier: 'PARITY-10',
    name: 'Canceled: duplicate intake request',
    status: 'canceled',
    teamKey: 'PARITY',
  }),
];

/**
 * (taskId → dependsOnId). `blocks` edges feed the "blocking" attention bucket
 * and the dependency rail; `relates` edges stay neutral metadata.
 */
export interface VolumeTaskEdge {
  dependsOnId: string;
  taskId: string;
  type: 'blocks' | 'relates';
}

export const VOLUME_TASK_EDGES: readonly VolumeTaskEdge[] = [
  { dependsOnId: 'task_pv0008', taskId: 'task_pv0009', type: 'blocks' },
  { dependsOnId: 'task_pv0005', taskId: 'task_pv0007', type: 'blocks' },
  { dependsOnId: 'task_pv0003', taskId: 'task_pv0006', type: 'relates' },
  { dependsOnId: 'task_pv0003', taskId: 'task_pv0016', type: 'blocks' },
  { dependsOnId: 'task_pv0014', taskId: 'task_pv0017', type: 'relates' },
  { dependsOnId: 'task_pv0036', taskId: 'task_pv0037', type: 'blocks' },
];

/* ── Reviews (in-product + external approvals) ─────────────────────────── */

export interface VolumeApprovalSpec {
  actionSummary: { summary: string; title: string };
  actionType: 'pull_request_review' | 'task_review';
  /** 'me' resolves to the fixture user; null keeps the row requester-only. */
  approverUserId: 'me' | null;
  baseSha?: string;
  baseVersion?: number;
  id: string;
  targetId: string;
  targetType: 'github_pull_request' | 'task';
}

export const VOLUME_APPROVALS: readonly VolumeApprovalSpec[] = [
  {
    actionSummary: {
      summary: 'The batch mutation run finished; confirm the outcome before it resumes.',
      title: 'Approve inbox batch mutation results',
    },
    actionType: 'task_review',
    approverUserId: 'me',
    baseVersion: 1,
    id: 'pv-approval-task-1',
    targetId: 'task_pv0033',
    targetType: 'task',
  },
  {
    actionSummary: {
      summary: 'Apollo shell review needs sign-off on the staged rollout plan.',
      title: 'Approve Apollo shell rollout plan',
    },
    actionType: 'task_review',
    approverUserId: 'me',
    baseVersion: 1,
    id: 'pv-approval-task-2',
    targetId: 'task_pv0006',
    targetType: 'task',
  },
  {
    actionSummary: {
      summary: 'Display-options rollout for the Projects timeline is ready for review.',
      title: 'Review PR #118: Timeline display options',
    },
    actionType: 'pull_request_review',
    approverUserId: 'me',
    baseSha: '1a2b3c4d5e6f77889900aabbccddeeff00112233',
    baseVersion: 1,
    id: 'pv-approval-pr-1',
    targetId: 'https://github.com/alexj11324/orvilo/pull/118',
    targetType: 'github_pull_request',
  },
  {
    actionSummary: {
      summary: 'Requested review on the dry-run harness — waiting on a teammate.',
      title: 'Review PR #132: migration dry-run harness',
    },
    actionType: 'pull_request_review',
    approverUserId: null,
    baseSha: 'ffeeddccbbaa99887766554433221100ffeeddcc',
    baseVersion: 1,
    id: 'pv-approval-pr-2',
    targetId: 'https://github.com/alexj11324/orvilo/pull/132',
    targetType: 'github_pull_request',
  },
];

/* ── Inbox additions (task-linked rows feed My issues → Activity) ──────── */

export interface VolumeNotificationSpec {
  actionKind?: string;
  actionRequestId?: string;
  category: string;
  content: string;
  dedupeKey: string;
  id: string;
  isRead: boolean;
  kind: 'action' | 'update';
  metadata?: NotificationMetadata;
  resourceId?: string;
  resourceType?: string;
  title: string;
  type: string;
}

export const VOLUME_NOTIFICATIONS: readonly VolumeNotificationSpec[] = [
  {
    actionKind: 'task_review',
    actionRequestId: 'pv-approval-task-1',
    category: 'pending',
    content: 'The batch mutation run needs your decision before it can continue.',
    dedupeKey: `${FIXTURE_DEDUPE_PREFIX}action-review`,
    id: volUuid(1),
    isRead: false,
    kind: 'action' as const,
    metadata: {
      agent: { backgroundColor: '#6d79d4', id: 'fixture-agent', name: 'Parity Agent' },
    },
    resourceId: 'task_pv0033',
    resourceType: 'task',
    title: 'Inbox batch mutation is waiting on you',
    type: 'task_review',
  },
  {
    category: 'mention',
    content: 'A teammate mentioned you on Apollo shell integration notes.',
    dedupeKey: `${FIXTURE_DEDUPE_PREFIX}mention-apx`,
    id: volUuid(2),
    isRead: false,
    kind: 'update' as const,
    metadata: { actor: { name: 'Fixture Teammate', userId: 'fixture-teammate' } },
    resourceId: 'task_pv0003',
    resourceType: 'task',
    title: 'Apollo integration needs your eyes',
    type: 'mention',
  },
  {
    category: 'activity',
    content: 'The migration dry-run posted fresh output to review.',
    dedupeKey: `${FIXTURE_DEDUPE_PREFIX}update-mrc`,
    id: volUuid(3),
    isRead: false,
    kind: 'update' as const,
    resourceId: 'task_pv0016',
    resourceType: 'task',
    title: 'Mercury dry-run finished',
    type: 'task_update',
  },
  {
    category: 'activity',
    content: 'Acceptance notes were assigned to you inside the parity cycle.',
    dedupeKey: `${FIXTURE_DEDUPE_PREFIX}assign-parity8`,
    id: volUuid(4),
    isRead: true,
    kind: 'update' as const,
    resourceId: 'task_pv0036',
    resourceType: 'task',
    title: 'You were assigned acceptance notes',
    type: 'task_assigned',
  },
  {
    category: 'activity',
    content: 'The readiness report moved to review on the Voyager track.',
    dedupeKey: `${FIXTURE_DEDUPE_PREFIX}update-vyg`,
    id: volUuid(5),
    isRead: false,
    kind: 'update' as const,
    resourceId: 'task_pv0024',
    resourceType: 'task',
    title: 'Voyager readiness report in review',
    type: 'task_update',
  },
];

/* ── Comments / activity / subscriptions / views / favorites ──────────── */

export const VOLUME_COMMENTS: readonly { content: string; id: string; taskId: string }[] = [
  {
    content: 'Synthetic note: integration checklist is green except the retry budget.',
    id: 'pvcomment00001',
    taskId: 'task_pv0003',
  },
  {
    content: 'Blocking on the approval card before resuming the batch.',
    id: 'pvcomment00002',
    taskId: 'task_pv0006',
  },
  {
    content: 'Mapping sheet draft attached in the working directory notes.',
    id: 'pvcomment00003',
    taskId: 'task_pv0014',
  },
  {
    content: 'Second reviewer pass requested by the fixture lead.',
    id: 'pvcomment00004',
    taskId: 'task_pv0033',
  },
];

export interface VolumeActivitySpec {
  daysOld: number;
  id: string;
  payload: TaskActivityLogPayload;
  taskId: string;
  type: TaskActivityLogType;
}

export const VOLUME_ACTIVITIES: readonly VolumeActivitySpec[] = [
  {
    daysOld: 6,
    id: volUuid(101),
    payload: { actorKind: 'user' as const, from: 'backlog', to: 'running' },
    taskId: 'task_pv0003',
    type: 'status' as const,
  },
  {
    daysOld: 6,
    id: volUuid(102),
    payload: { actorKind: 'user' as const, fromId: null, toId: 'self' },
    taskId: 'task_pv0003',
    type: 'assignee_user' as const,
  },
  {
    daysOld: 5,
    id: volUuid(103),
    payload: { actorKind: 'user' as const, from: 'running', to: 'paused' },
    taskId: 'task_pv0006',
    type: 'status' as const,
  },
  {
    daysOld: 5,
    id: volUuid(104),
    payload: { actorKind: 'user' as const, fromId: null, toId: 'self' },
    taskId: 'task_pv0006',
    type: 'reviewer' as const,
  },
  {
    daysOld: 4,
    id: volUuid(105),
    payload: { actorKind: 'user' as const, from: 3, to: 1 },
    taskId: 'task_pv0008',
    type: 'priority' as const,
  },
  {
    daysOld: 4,
    id: volUuid(106),
    payload: { actorKind: 'user' as const, from: 'backlog', to: 'running' },
    taskId: 'task_pv0016',
    type: 'status' as const,
  },
];

export const VOLUME_SUBSCRIBED_TASK_IDS = ['task_pv0003', 'task_pv0016', 'task_pv0033'] as const;

export const VOLUME_SAVED_VIEWS: readonly {
  displayOptions: Record<string, unknown>;
  id: string;
  layout: 'board' | 'list';
  name: string;
  query: WorkQuery;
  teamKey?: 'PARITY' | 'SHIP';
  visibility: 'private' | 'team' | 'workspace';
}[] = [
  {
    displayOptions: { showSubIssues: true },
    id: 'svparityvol0001',
    layout: 'board',
    name: 'Parity: Active board',
    query: {
      entityType: 'task',
      filter: {
        all: [{ field: 'workflowCategory', op: 'in', value: ['todo', 'in_progress', 'in_review'] }],
      },
      groupBy: 'workflowCategory',
      layout: 'board',
      schemaVersion: 1,
      sort: [{ direction: 'desc', field: 'updatedAt' }],
    },
    visibility: 'workspace',
  },
  {
    displayOptions: {},
    id: 'svparityvol0002',
    layout: 'list',
    name: 'Parity: Urgent issues',
    query: {
      entityType: 'task',
      filter: { all: [{ field: 'priority', op: 'eq', value: 1 }] },
      groupBy: 'none',
      layout: 'list',
      schemaVersion: 1,
      sort: [{ direction: 'desc', field: 'updatedAt' }],
    },
    visibility: 'private',
  },
  {
    displayOptions: { showMilestones: true },
    id: 'svparityvol0003',
    layout: 'board',
    name: 'Parity: Project portfolio',
    query: {
      entityType: 'project',
      groupBy: 'status',
      layout: 'board',
      schemaVersion: 1,
      sort: [{ direction: 'asc', field: 'name' }],
    },
    visibility: 'workspace',
  },
];

export type VolumeFavoriteSpec =
  | { rank: number; targetSlug: string; targetType: 'project' }
  | { rank: number; savedViewId: string; targetType: 'savedView' }
  | { rank: number; teamKey: 'PARITY' | 'SHIP'; targetType: 'team' };

export const VOLUME_FAVORITES: readonly VolumeFavoriteSpec[] = [
  { rank: 1, targetSlug: 'parity-apollo-platform', targetType: 'project' },
  { rank: 2, targetSlug: 'parity-voyager-launch', targetType: 'project' },
  { rank: 3, savedViewId: 'svparityvol0001', targetType: 'savedView' },
  { rank: 4, teamKey: 'PARITY', targetType: 'team' },
];
