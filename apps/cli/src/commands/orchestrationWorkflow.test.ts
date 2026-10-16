import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { log } from '../utils/logger';
import { registerOrchestrationWorkflowCommand } from './orchestrationWorkflow';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    orchestrationWorkflow: {
      create: { mutate: vi.fn() },
      submitPlan: { mutate: vi.fn() },
      submitDraft: { mutate: vi.fn() },
      submitOperationDraft: { mutate: vi.fn() },
      submitOperationPlan: { mutate: vi.fn() },
      graph: { query: vi.fn() },
      supervision: { query: vi.fn() },
      tick: { mutate: vi.fn() },
    },
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: async () => JSON.stringify({ action: 'verify', reason: 'Ready' }),
}));

vi.mock('../api/client', () => ({ getTrpcClient: vi.fn().mockResolvedValue(mockClient) }));
// Building the app URL otherwise resolves a workspace and a server, which needs
// a real login; the link's shape is what this file is asserting, not its host.
vi.mock('./task/url', () => ({
  resolveAppUrlBuilder: vi
    .fn()
    .mockResolvedValue((pathname: string) => `https://orvilo.aspectlylabs.com${pathname}`),
}));
const createProgram = () => {
  const program = new Command();
  program.exitOverride();
  registerOrchestrationWorkflowCommand(program);
  return program;
};

const waitingResult = {
  orchestrationWorkflowId: 'orchestration-workflow-1',
  message: 'Task T-1 is running',
  nodeId: 'node-1',
  outcome: 'waiting_external',
  taskId: 'task-1',
};

describe('orchestration workflow plan authentication', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(console.log).mockRestore();
  });

  it.each(['hetero-operation', 'cli-sandbox', undefined])(
    'routes %s credentials to the appropriate plan endpoint',
    async (purpose) => {
      vi.clearAllMocks();
      vi.stubEnv(
        'ORVILO_JWT',
        purpose
          ? `header.${Buffer.from(JSON.stringify({ purpose })).toString('base64url')}.signature`
          : undefined,
      );
      vi.spyOn(console, 'log').mockImplementation(() => {});
      mockClient.orchestrationWorkflow.submitPlan.mutate.mockResolvedValue({ data: {} });
      mockClient.orchestrationWorkflow.submitOperationPlan.mutate.mockResolvedValue({ data: {} });
      await createProgram().parseAsync([
        'node',
        'test',
        'orchestration-workflow',
        'plan',
        'orchestration-workflow-1',
        '--file',
        'plan.json',
        '--token',
        'turn-1',
        '--operation',
        'op-1',
      ]);
      const selected =
        purpose === 'hetero-operation'
          ? mockClient.orchestrationWorkflow.submitOperationPlan
          : mockClient.orchestrationWorkflow.submitPlan;
      const other =
        purpose === 'hetero-operation'
          ? mockClient.orchestrationWorkflow.submitPlan
          : mockClient.orchestrationWorkflow.submitOperationPlan;
      expect(selected.mutate).toHaveBeenCalledWith({
        id: 'orchestration-workflow-1',
        operationId: 'op-1',
        token: 'turn-1',
        plan: { action: 'verify', reason: 'Ready' },
      });
      expect(other.mutate).not.toHaveBeenCalled();
    },
  );
});

describe('orchestration workflow run command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('prints a repeated waiting state only once', async () => {
    mockClient.orchestrationWorkflow.tick.mutate
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({
        data: {
          orchestrationWorkflowId: 'orchestration-workflow-1',
          message: 'Orchestration workflow achieved',
          outcome: 'achieved',
        },
      });

    await createProgram().parseAsync([
      'node',
      'test',
      'orchestration-workflow',
      'run',
      'orchestration-workflow-1',
      '--poll-ms',
      '0',
    ]);

    const output = vi
      .mocked(console.log)
      .mock.calls.map(([value]) => String(value))
      .join('\n');
    expect(output.match(/Task T-1 is running/g)).toHaveLength(1);
    expect(output).toContain('Orchestration workflow achieved');
  });

  it('compresses repeated waiting states in JSON output', async () => {
    mockClient.orchestrationWorkflow.tick.mutate
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({
        data: {
          orchestrationWorkflowId: 'orchestration-workflow-1',
          message: 'Orchestration workflow achieved',
          outcome: 'achieved',
        },
      });

    await createProgram().parseAsync([
      'node',
      'test',
      'orchestration-workflow',
      'run',
      'orchestration-workflow-1',
      '--poll-ms',
      '10',
      '--json',
    ]);

    const result = JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ pollCount: 3, waitedMs: 30 });
    expect(result[1]).toMatchObject({ outcome: 'achieved' });
  });
});

describe('orchestration workflow run resilience', () => {
  let previousExitCode: number | string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    previousExitCode = process.exitCode;
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
  });

  const achieved = {
    orchestrationWorkflowId: 'orchestration-workflow-1',
    message: 'Orchestration workflow achieved',
    outcome: 'achieved',
  };
  // A tRPC rejection carries its verdict on `error.data.code`; a transport
  // failure (`fetch failed`) has no such envelope at all.
  const trpcError = (code: string) =>
    Object.assign(new Error(`${code} from server`), { data: { code } });

  const run = (...args: string[]) =>
    createProgram().parseAsync([
      'node',
      'test',
      'orchestration-workflow',
      'run',
      'orchestration-workflow-1',
      ...args,
    ]);

  const loggedOutput = () =>
    vi
      .mocked(console.log)
      .mock.calls.map(([value]) => String(value))
      .join('\n');

  it('rides out a transient tick failure instead of ending the run', async () => {
    // A single `fetch failed` used to abort the whole loop and leave the orchestration workflow
    // stranded mid-flight, which is what forced an external supervisor script.
    mockClient.orchestrationWorkflow.tick.mutate
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ data: achieved });

    await run('--poll-ms', '0', '--retry-window-ms', '20');

    expect(mockClient.orchestrationWorkflow.tick.mutate).toHaveBeenCalledTimes(2);
    expect(loggedOutput()).toContain('Orchestration workflow achieved');
    expect(process.exitCode).toBeUndefined();
  });

  it('does not retry a verdict about the request itself', async () => {
    mockClient.orchestrationWorkflow.tick.mutate.mockRejectedValue(trpcError('NOT_FOUND'));

    await expect(run('--poll-ms', '0', '--retry-window-ms', '5000')).rejects.toThrow('NOT_FOUND');

    expect(mockClient.orchestrationWorkflow.tick.mutate).toHaveBeenCalledTimes(1);
  });

  it('gives up once the retry window is spent', async () => {
    mockClient.orchestrationWorkflow.tick.mutate.mockRejectedValue(new Error('fetch failed'));

    await expect(run('--poll-ms', '0', '--retry-window-ms', '20')).rejects.toThrow('fetch failed');

    expect(mockClient.orchestrationWorkflow.tick.mutate.mock.calls.length).toBeGreaterThan(1);
  });

  it('spends the tick budget on progress, not on idle polls', async () => {
    // Three unchanged `waiting_external` polls sit between two advancing ticks.
    // The budget of 2 must cover only the advancing pair — counting the polls
    // stopped healthy orchestration workflows whose Work simply took a while to finish.
    mockClient.orchestrationWorkflow.tick.mutate
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({ data: waitingResult })
      .mockResolvedValueOnce({ data: achieved });

    await run('--poll-ms', '0', '--max-ticks', '2');

    expect(mockClient.orchestrationWorkflow.tick.mutate).toHaveBeenCalledTimes(5);
    expect(loggedOutput()).toContain('Orchestration workflow achieved');
    expect(process.exitCode).toBeUndefined();
  });

  it('reports an unfinished orchestration workflow with a non-zero exit code', async () => {
    // Each tick advances to a different task, so every one spends budget.
    mockClient.orchestrationWorkflow.tick.mutate.mockImplementation(async () => ({
      data: {
        ...waitingResult,
        taskId: `task-${mockClient.orchestrationWorkflow.tick.mutate.mock.calls.length}`,
      },
    }));

    await run('--poll-ms', '0', '--max-ticks', '2');

    expect(mockClient.orchestrationWorkflow.tick.mutate).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(expect.stringContaining('unfinished'));
  });
});

describe('orchestration workflow show command', () => {
  const node = (kind: string, title: string) => ({
    createdAt: new Date(0),
    id: `${kind}-node-id`,
    kind,
    priority: 0,
    status: 'waiting',
    taskId: kind === 'task' ? 'task_8A1DyvjIc7PL' : null,
    title,
    updatedAt: new Date(0),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  const render = async () => {
    await createProgram().parseAsync([
      'node',
      'test',
      'orchestration-workflow',
      'show',
      'orchestration-workflow-1',
    ]);
    return (
      vi
        .mocked(console.log)
        .mock.calls // `printGraph` calls `console.log()` bare for a blank line; stringifying that
        // would manufacture the very word the assertion below is looking for.
        .map(([value]) => (value === undefined ? '' : String(value)))
        .join('\n')
    );
  };

  it('renders a glyph for every node kind, including task', async () => {
    // The glyph map was keyed on the old `work` kind after the rename, so every
    // task row printed `undefined task` against a real orchestration workflow. Typing the map
    // proves each kind maps to *a* string; only rendering proves it maps to the
    // right one.
    mockClient.orchestrationWorkflow.graph.query.mockResolvedValue({
      data: {
        decisions: [],
        edges: [],
        events: [],
        orchestrationWorkflow: {
          id: 'orchestration-workflow-1',
          requirement: null,
          status: 'review',
          title: 'Three quotes',
        },
        nodes: [
          node('problem', 'Collect three quotes'),
          node('task', 'Ask vendor A'),
          node('finding', 'Vendor A quoted 1200'),
          node('decision', 'Retry or retire?'),
        ],
        workVersions: [],
      },
    });

    const output = await render();

    expect(output).toContain('▣ task');
    expect(output).toContain('◇ problem');
    expect(output).toContain('● finding');
    expect(output).toContain('◆ decision');
    expect(output).not.toContain('undefined');
  });

  it("states an incoming edge from the row owner's side, not the source's", async () => {
    // Edges read `source <kind> target`, so listing an INCOMING `depends_on` as
    // `depends_on:<source>` claimed the exact opposite of the graph: it made the
    // framework node look like it depended on the node that depends on IT, so a
    // correct plan read as a reversed one.
    mockClient.orchestrationWorkflow.graph.query.mockResolvedValue({
      data: {
        decisions: [],
        edges: [
          {
            orchestrationWorkflowId: 'orchestration-workflow-1',
            id: 'e1',
            kind: 'decomposes',
            sourceNodeId: 'problem-node-id',
            targetNodeId: 'task-node-id',
          },
          {
            orchestrationWorkflowId: 'orchestration-workflow-1',
            id: 'e2',
            kind: 'depends_on',
            sourceNodeId: 'finding-node-id',
            targetNodeId: 'task-node-id',
          },
        ],
        events: [],
        orchestrationWorkflow: {
          id: 'orchestration-workflow-1',
          requirement: null,
          status: 'review',
          title: 'Three quotes',
        },
        nodes: [
          node('problem', 'Collect three quotes'),
          node('task', 'Build the harness'),
          node('finding', 'Downstream work'),
        ],
        workVersions: [],
      },
    });

    const output = await render();

    expect(output).toContain('RELATIONS');
    // The task is part of the problem, and it BLOCKS the node that depends on it.
    expect(output).toContain('part of problem-');
    expect(output).toContain('blocks finding-');
    expect(output).not.toContain('depends_on');
  });

  it('still shows the responsible task id next to its node', async () => {
    mockClient.orchestrationWorkflow.graph.query.mockResolvedValue({
      data: {
        decisions: [],
        edges: [],
        events: [],
        orchestrationWorkflow: {
          id: 'orchestration-workflow-1',
          requirement: null,
          status: 'review',
          title: 'Three quotes',
        },
        nodes: [node('task', 'Ask vendor A')],
        workVersions: [],
      },
    });

    expect(await render()).toContain('task_8A1DyvjIc7PL');
  });
});

describe('orchestration workflow create command', () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it.each([undefined, 'task-worker'])(
    'inherits the calling Agent with Task assignee %s',
    async (worker) => {
      vi.stubEnv('ORVILO_AGENT_ID', 'creating-agent');
      mockClient.orchestrationWorkflow.create.mutate.mockResolvedValue({
        data: { orchestrationWorkflow: { id: 'orchestration-workflow-1' } },
      });
      await createProgram().parseAsync([
        'node',
        'test',
        'orchestration-workflow',
        'create',
        'Creator orchestration workflow',
        '--json',
        ...(worker ? ['--agent', worker] : []),
        '--max-manager-turns',
        '5',
      ]);
      expect(mockClient.orchestrationWorkflow.create.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: worker ?? 'creating-agent',
          createdByAgentId: 'creating-agent',
          config: expect.objectContaining({ manager: { maxTurns: 5 } }),
        }),
      );
    },
  );

  it('allows a person to select an Agent without inventing Agent authorship', async () => {
    vi.stubEnv('ORVILO_AGENT_ID', undefined);
    mockClient.orchestrationWorkflow.create.mutate.mockResolvedValue({
      data: { orchestrationWorkflow: { id: 'orchestration-workflow-1' } },
    });
    await createProgram().parseAsync([
      'node',
      'test',
      'orchestration-workflow',
      'create',
      'User orchestration workflow',
      '--agent',
      'selected-agent',
      '--json',
    ]);
    expect(mockClient.orchestrationWorkflow.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'selected-agent', createdByAgentId: undefined }),
    );
  });

  it('links to the registered Issue collection', async () => {
    // `orchestrationWorkflow.create` returns the whole graph snapshot, so the id lives on its
    // orchestration workflow. Reading `data.id` printed a link nobody could follow, and the CLI
    // cannot resolve the router's types to catch it.
    mockClient.orchestrationWorkflow.create.mutate.mockResolvedValue({
      data: {
        decisions: [],
        edges: [],
        events: [],
        orchestrationWorkflow: {
          id: 'orchestration_workflow_PrUIwfSnU9TH',
          requirement: null,
          status: 'planning',
          title: 'Fix bugs',
        },
        nodes: [],
        workVersions: [],
      },
    });

    await createProgram().parseAsync([
      'node',
      'test',
      'orchestration-workflow',
      'create',
      'Fix bugs',
    ]);

    const output = vi
      .mocked(console.log)
      .mock.calls.map(([value]) => (value === undefined ? '' : String(value)))
      .join('\n');

    expect(output).toContain('https://orvilo.aspectlylabs.com/tasks');
    expect(output).not.toContain('/goal/undefined');
  });

  it('sends task seeds and the per-Task attempt budget with the primary flags', async () => {
    mockClient.orchestrationWorkflow.create.mutate.mockResolvedValue({
      data: {
        decisions: [],
        edges: [],
        events: [],
        orchestrationWorkflow: {
          id: 'orchestration-workflow-1',
          requirement: null,
          status: 'planning',
          title: 'Fix bugs',
        },
        nodes: [],
        workVersions: [],
      },
    });

    await createProgram().parseAsync([
      'node',
      'test',
      'orchestration-workflow',
      'create',
      'Fix bugs',
      '--task',
      'Inspect',
      'Repair',
      '--max-attempts-per-task',
      '4',
      '--supervise',
      '--max-supervision-incidents',
      '6',
    ]);

    expect(mockClient.orchestrationWorkflow.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          recovery: expect.objectContaining({ maxAttemptsPerTask: 4 }),
          supervision: { enabled: true, maxIncidents: 6 },
        }),
        tasks: ['Inspect', 'Repair'],
      }),
    );
  });
});

describe('orchestration workflow supervision command', () => {
  it('exposes diagnostic identity and recovery metrics without advancing the Orchestration workflow', async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const data = {
      enabled: true,
      state: { topicId: 'supervisor-topic' },
      summary: { effectiveRecoveries: 0 },
    };
    mockClient.orchestrationWorkflow.supervision.query.mockResolvedValue({ data });
    await createProgram().parseAsync([
      'node',
      'test',
      'orchestration-workflow',
      'supervision',
      'orchestration-workflow-1',
    ]);
    expect(mockClient.orchestrationWorkflow.supervision.query).toHaveBeenCalledWith({
      id: 'orchestration-workflow-1',
    });
    expect(JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))).toEqual(data);
    expect(mockClient.orchestrationWorkflow.tick.mutate).not.toHaveBeenCalled();
  });
});

describe('ACP planning draft submission', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it.each(['hetero-operation', 'cli-sandbox'])(
    'submits with %s credentials and the runtime operation ID',
    async (purpose) => {
      vi.clearAllMocks();
      vi.stubEnv('ORVILO_OPERATION_ID', 'planning-op');
      vi.stubEnv(
        'ORVILO_JWT',
        `header.${Buffer.from(JSON.stringify({ purpose })).toString('base64url')}.signature`,
      );
      vi.spyOn(console, 'log').mockImplementation(() => {});
      await createProgram().parseAsync([
        'node',
        'test',
        'orchestration-workflow',
        'submit-draft',
        '--token',
        'round',
        '--file',
        'draft.json',
      ]);
      const selected =
        purpose === 'hetero-operation'
          ? mockClient.orchestrationWorkflow.submitOperationDraft
          : mockClient.orchestrationWorkflow.submitDraft;
      expect(selected.mutate).toHaveBeenCalledWith({
        operationId: 'planning-op',
        token: 'round',
        result: { action: 'verify', reason: 'Ready' },
      });
    },
  );
});
