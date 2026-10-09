import superjson from 'superjson';

import type { PreviewDatabase } from './fixtures';
import {
  createAgent,
  createInitialDatabase,
  PREVIEW_STORAGE_KEY,
  PREVIEW_USER_ID,
  previewUser,
  previewWorkspace,
  runtimeConfig,
} from './fixtures';

type Input = Record<string, any>;
export class PreviewUnsupportedError extends Error {}
export function createPreviewBackend(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
) {
  let db: PreviewDatabase = createInitialDatabase();
  try {
    const saved = storage?.getItem(PREVIEW_STORAGE_KEY);
    if (saved) {
      const value = superjson.parse<PreviewDatabase>(saved);
      if (value.version === 1) db = value;
    }
  } catch {
    /* Recover only the isolated preview fixture. */
  }
  const save = () => storage?.setItem(PREVIEW_STORAGE_KEY, superjson.stringify(db));
  const success = (data: unknown) => ({ data, success: true });
  const agent = (id?: string) =>
    db.agents.find((a) => a.id === id || a.slug === id) ?? db.agents[0];
  const filteredTasks = (input: Input) =>
    db.tasks.filter(
      (t) =>
        (!input.assigneeAgentId || t.assigneeAgentId === input.assigneeAgentId) &&
        (!input.scope ||
          (input.scope === 'assigned' && t.assigneeUserId === PREVIEW_USER_ID) ||
          (input.scope === 'created' && t.createdByUserId === PREVIEW_USER_ID) ||
          (input.scope === 'delegated' && (t as Input).delegatedByUserId === PREVIEW_USER_ID)) &&
        (input.projectId === undefined || t.projectId === input.projectId) &&
        (!input.statuses?.length || input.statuses.includes(t.status)) &&
        !input.excludeStatuses?.includes(t.status) &&
        (!input.parentTaskId || t.parentTaskId === input.parentTaskId) &&
        (input.automated === undefined || Boolean(t.automationMode) === input.automated),
    );
  function execute(path: string, input: Input = {}, mutation = false): unknown {
    switch (path) {
      case 'config.getGlobalConfig': {
        return runtimeConfig;
      }
      case 'connector.list':
      case 'recent.getAll':
      case 'taskLabel.getLabels':
      case 'agentDocument.listDocuments': {
        return [];
      }
      case 'workspace.list': {
        return [previewWorkspace];
      }
      case 'workspace.ensureDefault': {
        return previewWorkspace;
      }
      case 'team.teams':
      case 'linearSync.issueLinks': {
        return success([]);
      }
      case 'workspaceUserSettings.getPreference': {
        return db.userState.preference;
      }
      case 'workspaceUserSettings.updatePreference': {
        db.userState.preference = { ...db.userState.preference, ...input };
        save();
        return db.userState.preference;
      }
      case 'workspaceMember.list': {
        return [
          {
            userId: PREVIEW_USER_ID,
            workspaceId: previewWorkspace.id,
            role: 'owner',
            user: { ...previewUser, fullName: previewUser.name, avatar: null },
            joinedAt: new Date('2026-10-07'),
            deletedAt: null,
            suspendedAt: null,
            authzVersion: 1,
            openAssignedCount: 3,
            openReviewingCount: 1,
            projectCount: 1,
          },
        ];
      }
      case 'userMemory.getPersona': {
        return null;
      }
      case 'resourcePermission.getGeneralAccess': {
        if (input.resourceType !== 'agent' || !db.agents.some((a) => a.id === input.resourceId))
          throw new Error('Resource is not part of the local preview.');
        return {
          accessLevel: 'edit',
          generalAccess: 'editor',
          canManage: true,
          canUseResource: false,
          creatorId: PREVIEW_USER_ID,
          visibility: 'public',
        };
      }
      case 'workAttention.favoriteList':
      case 'providerBinding.list': {
        return success([]);
      }
      case 'pullRequest.queue': {
        return success({
          items: [],
          total: 0,
          hasMore: false,
          nextCursor: null,
          pageInfo: { hasNextPage: false, endCursor: null },
          connected: false,
          viewer: null,
          rateLimit: null,
        });
      }
      case 'home.getSidebarAgentList': {
        return {
          groups: [],
          pinned: [],
          privateGroups: [],
          privatePinned: [],
          privateUngrouped: [],
          ungrouped: db.agents.map((a) => ({
            ...a,
            type: 'agent',
            heterogeneousType: a.agencyConfig.heterogeneousProvider.type,
            unreadCount: 0,
            labels: [],
            groupId: null,
          })),
        };
      }
      case 'aiProvider.getAiProviderRuntimeState': {
        return {
          enabledAiModels: [],
          enabledAiProviders: [],
          enabledChatAiProviders: [],
          enabledImageAiProviders: [],
          enabledVideoAiProviders: [],
          hiddenBuiltinModels: [],
          hiddenBuiltinModelsResolved: true,
          modelRedirects: {},
          providerBindingAgentTypes: {},
          runtimeConfig: {},
        };
      }
      case 'config.getDefaultAgentConfig': {
        return {};
      }
      case 'user.getUserState': {
        return db.userState;
      }
      case 'user.getUserSSOProviders': {
        return [];
      }
      case 'user.getUserRegistrationDuration': {
        return { createdAt: new Date(), updatedAt: new Date(), duration: 30 };
      }
      case 'user.getUserActivitySummary': {
        return { lastUserMessageAt: new Date(), userCreatedAt: new Date() };
      }
      case 'user.updateSettings': {
        db.userState.settings = {
          ...db.userState.settings,
          ...input,
          general: { ...db.userState.settings.general, ...input.general },
        };
        save();
        return undefined;
      }
      case 'user.updatePreference': {
        db.userState.preference = { ...db.userState.preference, ...input };
        save();
        return undefined;
      }
      case 'agent.getBuiltinAgent': {
        return agent(input.slug);
      }
      case 'agent.getAgentConfigById': {
        return agent(input.agentId);
      }
      case 'agent.getAgentConfig': {
        return agent(input.sessionId);
      }
      case 'agent.resolveAgentIdBySlug': {
        return { agentId: agent(input.slug).id };
      }
      case 'agent.queryAgents': {
        return db.agents.filter(
          (a) => !input.keyword || a.title.toLowerCase().includes(input.keyword.toLowerCase()),
        );
      }
      case 'agent.countAgents': {
        return db.agents.length;
      }
      case 'agent.getKnowledgeBasesAndFiles': {
        return { files: [], knowledgeBases: [] };
      }
      case 'agent.getTransferJobStatus': {
        return null;
      }
      case 'agent.getAgentRuntimeForCreation': {
        return agent(input.agentId);
      }
      case 'agent.createAgent': {
        const id = 'preview-agent-' + crypto.randomUUID();
        db.agents.push(createAgent(id, input.config?.title || `Agent ${db.agents.length + 1}`));
        save();
        return { agentId: id };
      }
      case 'agent.updateAgentConfig': {
        const record = db.agents.find((a) => a.id === input.agentId);
        if (!record) throw new Error('Preview agent not found.');
        Object.assign(record, input.value, { updatedAt: new Date() });
        save();
        return record;
      }
      case 'topic.createTopic': {
        const id = 'preview-topic-' + crypto.randomUUID();
        db.topics.push({
          ...createInitialDatabase().topics[0],
          ...input,
          id,
          title: input.title || 'New conversation',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        save();
        return id;
      }
      case 'topic.updateTopic': {
        const row = db.topics.find((t) => t.id === input.id);
        if (!row) throw new Error('Preview conversation not found.');
        Object.assign(row, input.value, { updatedAt: new Date() });
        save();
        return row;
      }
      case 'task.create': {
        const parent = input.parentTaskId
          ? db.tasks.find((t) => t.id === input.parentTaskId || t.identifier === input.parentTaskId)
          : undefined;
        if (input.parentTaskId && !parent)
          throw new Error('Parent issue not found in this preview.');
        const seq = Math.max(100, ...db.tasks.map((t) => t.seq)) + 1;
        const record = {
          ...createInitialDatabase().tasks[0],
          ...input,
          id: 'preview-task-' + crypto.randomUUID(),
          parentTaskId: parent?.id ?? null,
          identifier: `UI-${seq}`,
          seq,
          name: String(input.name || input.instruction || 'Untitled issue').slice(0, 180),
          instruction: input.instruction || '',
          workflowCategory: input.workflowCategory || 'backlog',
          status: 'backlog',
          assigneeAgentId: input.assigneeAgentId || null,
          assigneeAgent: null,
          assigneeUserId: input.assigneeUserId || null,
          assigneeUser: null,
          reviewerUserId: null,
          priority: input.priority ?? 0,
          projectId: input.projectId ?? null,
          domainRevision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          position: seq * 1000,
        };
        db.tasks.push(record);
        save();
        return success(record);
      }
      case 'task.update': {
        const row = db.tasks.find((t) => t.id === input.id || t.identifier === input.id);
        if (!row) throw new Error('Preview issue not found.');
        if (
          input.expectedDomainRevision !== undefined &&
          input.expectedDomainRevision !== row.domainRevision
        )
          throw new Error('The issue changed. Refresh before editing.');
        const fields = [
          'name',
          'instruction',
          'description',
          'priority',
          'workflowCategory',
          'status',
          'assigneeAgentId',
          'assigneeUserId',
          'reviewerUserId',
          'projectId',
          'position',
          'parentTaskId',
        ];
        for (const key of fields) if (key in input) Object.assign(row, { [key]: input[key] });
        Object.assign(row, {
          updatedAt: new Date(),
          domainRevision: row.domainRevision + 1,
          assigneeAgent: db.agents.find((a) => a.id === row.assigneeAgentId) ?? null,
        });
        save();
        return success(row);
      }
      case 'task.delete': {
        const row = db.tasks.find((t) => t.id === input.id || t.identifier === input.id);
        if (!row) throw new Error('Preview issue not found.');
        db.tasks = db.tasks.filter((t) => t.id !== input.id && t.identifier !== input.id);
        save();
        return success(row);
      }
      case 'project.detail': {
        const row = db.projects.find((p) => p.id === input.id);
        if (!row) throw new Error('Preview project not found.');
        return success({
          ...row,
          milestones: [],
          taskCount: db.tasks.filter((t) => t.projectId === row.id).length,
        });
      }
      case 'project.update': {
        const row = db.projects.find((p) => p.id === input.id);
        if (!row) throw new Error('Preview project not found.');
        Object.assign(row, input, { updatedAt: new Date() });
        save();
        return success(row);
      }
      case 'task.list': {
        const all = filteredTasks(input);
        return {
          ...success(all.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 100))),
          total: all.length,
        };
      }
      case 'task.groupList': {
        const tasks = filteredTasks(input);
        if (input.groupBy) {
          const field =
            input.groupBy === 'agent'
              ? 'assigneeAgentId'
              : input.groupBy === 'member'
                ? 'assigneeUserId'
                : input.groupBy === 'priority'
                  ? 'priority'
                  : undefined;
          if (!field)
            throw new PreviewUnsupportedError(
              'This board grouping is not connected in the preview.',
            );
          const prefix = input.groupBy === 'agent' ? 'assignee:' : `${input.groupBy}:`;
          const values =
            input.groupBy === 'priority'
              ? [1, 2, 3, 4, 0]
              : [...new Set([...tasks.map((t) => (t as Input)[field] ?? null), null])];
          return success(
            values.map((value) => {
              const key = `${prefix}${value ?? 'unassigned'}`;
              const rows = tasks.filter(
                (t) => ((t as Input)[field] ?? (field === 'priority' ? 0 : null)) === value,
              );
              const limit = input.groupLimits?.[key] ?? 50;
              return {
                key,
                [field]: value,
                tasks: rows.slice(0, limit),
                total: rows.length,
                hasMore: rows.length > limit,
              };
            }),
          );
        }
        const groups =
          input.groups ??
          ['triage', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'].map(
            (key) => ({ key, workflowCategories: [key] }),
          );
        return success(
          groups.map((g: Input) => {
            const rows = tasks.filter(
              (t) =>
                g.workflowCategories?.includes(t.workflowCategory) ||
                g.statuses?.includes(t.status),
            );
            return {
              ...g,
              tasks: rows.slice(g.offset ?? 0, (g.offset ?? 0) + (g.limit ?? 50)),
              total: rows.length,
              hasMore: (g.offset ?? 0) + (g.limit ?? 50) < rows.length,
            };
          }),
        );
      }
      case 'task.find':
      case 'task.detail': {
        const task = db.tasks.find((t) => t.id === input.id || t.identifier === input.id);
        if (!task) throw new Error('Issue not found in this preview.');
        return success(
          path.endsWith('detail')
            ? {
                ...task,
                subtasks: db.tasks.filter(
                  (t) => t.parentTaskId === task.id || t.parentTaskId === task.identifier,
                ),
                topics: [],
                dependencies: [],
                activities: [],
                pinnedDocuments: [],
              }
            : task,
        );
      }
      case 'project.list': {
        return {
          ...success(
            db.projects.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 100)),
          ),
          total: db.projects.length,
        };
      }
      case 'topic.getTopics': {
        const topics = db.topics.filter(
          (t) => input.scope === 'workspace' || !input.agentId || t.agentId === input.agentId,
        );
        const pageSize = input.pageSize ?? 100;
        const offset = Math.max(0, (input.current ?? 1) - 1) * pageSize;
        return { items: topics.slice(offset, offset + pageSize), total: topics.length };
      }
      case 'topic.queryTopics': {
        return input.cursor !== undefined || input.pageSize
          ? { items: db.topics, nextCursor: null }
          : db.topics;
      }
      case 'topic.getTopic': {
        return db.topics.find((t) => t.id === input.id) ?? null;
      }
      case 'message.getMessages': {
        return db.messages.filter((m) => m.topicId === input.topicId);
      }
      case 'task.getSubtasks':
      case 'task.getTaskTree': {
        const parent = db.tasks.find((t) => t.id === input.id || t.identifier === input.id);
        if (!parent) throw new Error('Issue not found in this preview.');
        const children = db.tasks.filter(
          (t) => t.parentTaskId === parent.id || t.parentTaskId === parent.identifier,
        );
        if (path === 'task.getSubtasks') return success(children);
        const tree = [parent];
        const seen = new Set([parent.id]);
        for (let i = 0; i < tree.length; i++)
          for (const child of db.tasks.filter(
            (t) => t.parentTaskId === tree[i].id || t.parentTaskId === tree[i].identifier,
          )) {
            if (!seen.has(child.id)) {
              seen.add(child.id);
              tree.push(child);
            }
          }
        return success(tree);
      }
      case 'task.getTopics':
      case 'task.getDependencies':
      case 'task.getPinnedDocuments': {
        return success([]);
      }
      case 'task.getCheckpoint':
      case 'task.getReview':
      case 'task.getVerifyConfig': {
        return success(null);
      }
    }
    const emptyLists = new Set([
      'session.getSessions',
      'sessionGroup.getSessionGroups',
      'agent.getAgentDocuments',
      'agentDocument.list',
      'agentDocument.getDocuments',
      'group.queryGroups',
      'group.getGroups',
      'recent.list',
      'favorite.list',
      'workFavorite.list',
      'project.queryProjects',
      'taskTemplate.list',
      'taskTemplate.listDailyRecommend',
      'taskTemplate.listByCategory',
      'notification.list',
      'notification.getNotifications',
      'inbox.list',
      'topic.recentTopics',
      'aiProvider.getAiProviderList',
      'aiModel.getEnabledModels',
      'aiModel.getAiModelList',
      'device.list',
      'device.listDevices',
      'device.getDevices',
      'device.listMyDevices',
      'mcp.list',
      'tools.getInstalledPlugins',
      'plugin.getInstalledPlugins',
    ]);
    if (!mutation && emptyLists.has(path)) return [];
    throw new PreviewUnsupportedError(
      `This action is not connected in the frontend preview (${path}). No request was sent to a backend.`,
    );
  }
  return {
    execute,
    getDatabase: () => db,
    reset: () => {
      storage?.removeItem(PREVIEW_STORAGE_KEY);
      db = createInitialDatabase();
    },
  };
}

export function installPreviewTransport() {
  const backend = createPreviewBackend(window.localStorage);
  const originalFetch = window.fetch.bind(window);
  const requests: { path: string; input: unknown; mutation: boolean; supported: boolean }[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Orvilo-Preview': 'local-fixture' },
    });
  window.fetch = async (resource, init) => {
    const request = new Request(
      new URL(resource instanceof Request ? resource.url : String(resource), location.href),
      resource instanceof Request ? resource : init,
    );
    if (request.signal.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    const url = new URL(request.url);
    if (url.pathname === '/api/auth/session') return json({ user: previewUser });
    if (url.pathname === '/api/auth/accounts')
      return json({ providers: [], hasPasswordAccount: false });
    if (url.pathname === '/api/version') return json({ version: 'ui-preview' });
    if (url.pathname.startsWith('/trpc/')) {
      const batch = url.searchParams.get('batch') === '1';
      const paths = decodeURIComponent(url.pathname.split('/').at(-1)!).split(',');
      const payload =
        request.method === 'GET'
          ? JSON.parse(url.searchParams.get('input') || '{}')
          : JSON.parse((await request.text()) || '{}');
      const results = paths.map((path, index) => {
        const raw = batch ? payload[index] : payload;
        const input = raw && 'json' in raw ? superjson.deserialize(raw) : raw;
        const trace = { path, input, mutation: request.method === 'POST', supported: true };
        requests.push(trace);
        if (requests.length > 200) requests.shift();
        try {
          return {
            result: {
              data: superjson.serialize(backend.execute(path, input ?? {}, trace.mutation)),
            },
          };
        } catch (error) {
          trace.supported = false;
          return {
            error: superjson.serialize({
              message: error instanceof Error ? error.message : 'Preview error',
              code: -32601,
              data: { code: 'NOT_IMPLEMENTED', httpStatus: 501, path },
            }),
          };
        }
      });
      return json(batch ? results : results[0]);
    }
    if (
      url.origin !== location.origin ||
      ['/api/', '/webapi/', '/oidc/'].some((prefix) => url.pathname.startsWith(prefix))
    ) {
      requests.push({
        path: url.pathname,
        input: null,
        mutation: request.method !== 'GET',
        supported: false,
      });
      return json({ error: 'External services are disabled in this local-data preview.' }, 501);
    }
    return originalFetch(resource, init);
  };
  Object.defineProperty(window, '__ORVILO_PREVIEW__', {
    configurable: true,
    value: {
      requests,
      reset: () => {
        backend.reset();
        location.reload();
      },
      snapshot: backend.getDatabase,
    },
  });
}
