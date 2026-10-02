import type { UIChatMessage } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { buildChatRows } from './chatRows';

const msg = (
  id: string,
  role: UIChatMessage['role'],
  metadata?: UIChatMessage['metadata'],
): UIChatMessage => ({ content: '', createdAt: 0, id, metadata, role, updatedAt: 0 }) as any;

const steered = [
  msg('u1', 'user'),
  msg('g1', 'assistantGroup'),
  msg('s1', 'user', { steer: true }),
  msg('g2', 'assistantGroup'),
  msg('s2', 'user', { steer: true }),
  msg('a3', 'assistant'),
];

describe('buildChatRows', () => {
  it('keeps a plain conversation flat', () => {
    const rows = buildChatRows([
      msg('u1', 'user'),
      msg('g1', 'assistantGroup'),
      msg('u2', 'user'),
      msg('g2', 'assistantGroup'),
    ]);

    expect(rows).toEqual([{ id: 'u1' }, { id: 'g1' }, { id: 'u2' }, { id: 'g2' }]);
  });

  it('folds steer turns into the host row and never lifts the steer messages out', () => {
    expect(buildChatRows(steered)).toEqual([
      { id: 'u1' },
      {
        continuations: [
          { groupId: 'g2', steerUserId: 's1' },
          { groupId: 'a3', steerUserId: 's2' },
        ],
        id: 'g1',
      },
    ]);
  });

  it('is a pure function of the messages', () => {
    expect(buildChatRows(steered)).toEqual(buildChatRows([...steered]));
  });

  it('leaves a steer message flat when nothing follows it or no group precedes it', () => {
    expect(
      buildChatRows([
        msg('u1', 'user'),
        msg('g1', 'assistantGroup'),
        msg('s1', 'user', { steer: true }),
      ]),
    ).toEqual([{ id: 'u1' }, { id: 'g1' }, { id: 's1' }]);

    expect(
      buildChatRows([msg('s1', 'user', { steer: true }), msg('g1', 'assistantGroup')]),
    ).toEqual([{ id: 's1' }, { id: 'g1' }]);
  });

  it('breaks the chain at a regular user message', () => {
    const rows = buildChatRows([
      msg('u1', 'user'),
      msg('g1', 'assistantGroup'),
      msg('u2', 'user'),
      msg('g2', 'assistantGroup'),
      msg('s1', 'user', { steer: true }),
      msg('g3', 'assistantGroup'),
    ]);

    expect(rows.map((row) => row.id)).toEqual(['u1', 'g1', 'u2', 'g2']);
  });

  it('interleaves an agent-handoff marker before the first newer message', () => {
    const rows = buildChatRows(
      [
        { ...msg('u1', 'user'), createdAt: 1000 },
        { ...msg('g1', 'assistantGroup'), createdAt: 2000 },
        { ...msg('u2', 'user'), createdAt: 3000 },
      ],
      [{ at: new Date(2500).toISOString(), fromAgentId: 'a', toAgentId: 'b' }],
    );

    expect(rows).toEqual([
      { id: 'u1' },
      { id: 'g1' },
      {
        id: `agent-handoff-${new Date(2500).toISOString()}-b`,
        marker: { kind: 'agentHandoff', toAgentId: 'b' },
      },
      { id: 'u2' },
    ]);
  });

  it('appends a trailing handoff marker and sorts out-of-order handoffs', () => {
    const h1 = { at: new Date(500).toISOString(), fromAgentId: 'a', toAgentId: 'b' };
    const h2 = { at: new Date(4000).toISOString(), fromAgentId: 'b', toAgentId: 'c' };

    const rows = buildChatRows([{ ...msg('u1', 'user'), createdAt: 1000 }], [h2, h1]);

    expect(rows).toEqual([
      {
        id: `agent-handoff-${h1.at}-b`,
        marker: { kind: 'agentHandoff', toAgentId: 'b' },
      },
      { id: 'u1' },
      {
        id: `agent-handoff-${h2.at}-c`,
        marker: { kind: 'agentHandoff', toAgentId: 'c' },
      },
    ]);
  });
});
