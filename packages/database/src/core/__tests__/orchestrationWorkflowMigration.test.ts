// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../migrations/0212_orchestration_workflow.sql'),
  'utf8',
);

describe('orchestration workflow in-place migration', () => {
  it('preserves rows and references, renames SQL objects and technical JSON, and can run twice', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE goals (id text PRIMARY KEY, title text, config jsonb, started_at timestamptz, created_at timestamptz DEFAULT now());
        CREATE TABLE goal_nodes (id text PRIMARY KEY, goal_id text NOT NULL CONSTRAINT goal_nodes_goal_id_goals_id_fk REFERENCES goals(id), title text);
        CREATE INDEX goal_nodes_goal_id_status_idx ON goal_nodes(goal_id);
        CREATE TABLE goal_traces (id text PRIMARY KEY, goal_id text REFERENCES goals(id), metadata jsonb);
        CREATE TABLE verify_runs (id text PRIMARY KEY, goal text, metadata jsonb);
        CREATE TABLE documents (id text PRIMARY KEY, editor_data jsonb);
        CREATE TABLE connector_tools (id text PRIMARY KEY, input_schema jsonb);
        CREATE TABLE ai_models (id text PRIMARY KEY, type varchar(20));
        CREATE TABLE tasks (id text PRIMARY KEY, name text, error text);
        CREATE TABLE task_topics (id text PRIMARY KEY, trigger text);
        CREATE TABLE message_plugins (id text PRIMARY KEY, identifier text, api_name text);
        INSERT INTO goals VALUES ('goal_original', 'Keep this objective', '{"goalId":"goal_original","notes":"goal is an objective","artifactPath":"goal.md","literal":"orvilo-goal","purpose":"goal.criteria.draft","tools":["orvilo-goal"],"api":"startOrchestrationWorkflow"}', null, now());
        INSERT INTO goal_nodes VALUES ('node_original', 'goal_original', 'Keep this Issue');
        INSERT INTO goal_traces VALUES ('trace_original', 'goal_original', '{"s3Key":"goal-traces/goal_original.json.zst"}');
        INSERT INTO verify_runs VALUES ('run_original', 'Keep this objective', '{"goalReview":{"status":"passed"},"goalClosure":"done","harnessInit":{"goal":{"objective":"keep this goal"},"includeGoals":true,"initialGoal":{"objective":"keep"}}}');
        INSERT INTO documents VALUES ('doc', '{"children":[{"text":"goal"}],"goal":"user text"}');
        INSERT INTO connector_tools VALUES ('external', '{"properties":{"goal":{"type":"string"}},"required":["goal"]}');
        INSERT INTO ai_models VALUES ('model', 'chat');
        INSERT INTO tasks VALUES ('acceptance', 'Complete full Goal acceptance', 'Goal Task operation lease expired.');
        INSERT INTO task_topics VALUES ('attempt', 'goal');
        INSERT INTO message_plugins VALUES ('legacy-task-tool', 'orvilo-task', 'createGoal');
      `);
      await db.exec(migration);
      await db.exec(migration);
      const { rows } = await db.query<{
        id: string;
        title: string;
        config: Record<string, unknown>;
      }>('SELECT * FROM orchestration_workflows');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'goal_original',
        title: 'Keep this objective',
        config: {
          orchestrationWorkflowId: 'goal_original',
          notes: 'goal is an objective',
          artifactPath: 'goal.md',
          literal: 'orvilo-goal',
          purpose: 'orchestrationWorkflow.criteria.draft',
          tools: ['orvilo-orchestration-workflow'],
          api: 'startOrchestrationWorkflow',
        },
      });
      expect((await db.query('SELECT identifier, api_name FROM message_plugins')).rows).toEqual([
        { identifier: 'orvilo-task', api_name: 'startOrchestrationWorkflow' },
      ]);
      expect(rows[0].config.planConfirmedAt).toBeTruthy();
      expect(
        (await db.query('SELECT id, orchestration_workflow_id FROM orchestration_workflow_nodes'))
          .rows,
      ).toEqual([{ id: 'node_original', orchestration_workflow_id: 'goal_original' }]);
      expect((await db.query('SELECT metadata FROM orchestration_workflow_traces')).rows).toEqual([
        { metadata: { s3Key: 'goal-traces/goal_original.json.zst' } },
      ]);
      expect(
        (await db.query('SELECT orchestration_workflow, metadata FROM verify_runs')).rows,
      ).toEqual([
        {
          orchestration_workflow: 'Keep this objective',
          metadata: {
            orchestrationWorkflowReview: { status: 'passed' },
            goalClosure: 'done',
            harnessInit: {
              goal: { objective: 'keep this goal' },
              includeGoals: true,
              initialGoal: { objective: 'keep' },
            },
          },
        },
      ]);
      expect((await db.query('SELECT editor_data FROM documents')).rows).toEqual([
        { editor_data: { children: [{ text: 'goal' }], goal: 'user text' } },
      ]);
      expect((await db.query('SELECT input_schema FROM connector_tools')).rows).toEqual([
        { input_schema: { properties: { goal: { type: 'string' } }, required: ['goal'] } },
      ]);
      expect((await db.query('SELECT type FROM ai_models')).rows).toEqual([{ type: 'chat' }]);
      expect((await db.query('SELECT name FROM tasks')).rows).toEqual([
        { name: 'Complete full Orchestration workflow acceptance' },
      ]);
      expect(
        (
          await db.query(
            'SELECT tasks.error, task_topics.trigger FROM tasks CROSS JOIN task_topics',
          )
        ).rows,
      ).toEqual([
        {
          error: 'Orchestration workflow Task operation lease expired.',
          trigger: 'orchestrationWorkflow',
        },
      ]);
      expect(
        (
          await db.query(
            "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE '%goal%'",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname LIKE '%goal%'",
          )
        ).rows,
      ).toEqual([]);
      await expect(
        db.exec("INSERT INTO orchestration_workflow_nodes VALUES ('bad', 'missing', 'Bad')"),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});
