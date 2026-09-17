// @vitest-environment node
import type { AddressInfo } from 'node:net';

import type { CollaborationServerMessage } from '@orvilo/types';
import { exportJWK, generateKeyPair, type KeyLike, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { listenGateway } from '../server';

let privateKey: KeyLike;
let kid: string;
let gateway: Awaited<ReturnType<typeof listenGateway>>;
let port: number;

const signRoomTicket = async (params: { room: string; userId: string; jti?: string }) =>
  new SignJWT({
    actor: { id: params.userId, kind: 'human' },
    purpose: 'collaboration-room',
    room: params.room,
    workspace_id: 'ws-1',
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer('urn:lobehub:internal')
    .setAudience('urn:orvilo:collaboration-gateway')
    .setSubject(params.userId)
    .setJti(params.jti ?? `jti-${params.userId}-${Math.random()}`)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(privateKey);

const signPublishToken = async () =>
  new SignJWT({ purpose: 'collaboration-gateway-publish' })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer('urn:lobehub:internal')
    .setAudience('urn:orvilo:collaboration-gateway')
    .setJti(`pub-${Math.random()}`)
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(privateKey);

const connect = async (query: string) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/collaboration?${query}`);
  const messages: CollaborationServerMessage[] = [];
  const errors: Error[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  ws.on('error', (error) => errors.push(error));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { errors, messages, ws };
};

const nextMessage = (messages: CollaborationServerMessage[], type: string, timeoutMs = 2000) =>
  new Promise<CollaborationServerMessage>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const index = messages.findIndex((message) => message.type === type);
      if (index >= 0) {
        resolve(messages.splice(index, 1)[0]);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`timed out waiting for '${type}'`));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.privateKey);
  jwk.alg = 'RS256';
  jwk.kid = 'it-key';
  kid = 'it-key';
  process.env.JWKS_KEY = JSON.stringify({ keys: [jwk] });

  gateway = await listenGateway(0, { sweepIntervalMs: 0 });
  port = (gateway.server.address() as AddressInfo).port;
});

afterAll(async () => {
  await gateway.close();
});

describe('gateway protocol', () => {
  it('rejects a connection without a ticket', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/collaboration?room=task:t1`);
    const code = await new Promise<number>((resolve) => {
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('error', () => resolve(0));
    });
    expect(code).toBe(401);
  });

  it('rejects a ticket minted for a different room', async () => {
    const token = await signRoomTicket({ room: 'task:other', userId: 'user-1' });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/collaboration?room=task:t1&token=${token}`);
    const code = await new Promise<number>((resolve) => {
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('error', () => resolve(0));
    });
    expect(code).toBe(401);
  });

  it('serves snapshot, presence, pong and revoked flows', async () => {
    const tokenA = await signRoomTicket({ room: 'task:t1', userId: 'user-a' });
    const tokenB = await signRoomTicket({ room: 'task:t1', userId: 'user-b' });

    const a = await connect(`room=task:t1&token=${tokenA}`);
    const snapshotA = await nextMessage(a.messages, 'snapshot');
    expect(snapshotA).toMatchObject({ presence: [], type: 'snapshot' });
    expect(typeof (snapshotA as { connectionId?: string }).connectionId).toBe('string');

    const b = await connect(`room=task:t1&token=${tokenB}`);
    await nextMessage(b.messages, 'snapshot');

    // presence fans out to the other connection with the server-derived actor
    b.ws.send(JSON.stringify({ type: 'presence', state: { typing: true } }));
    const presenceAtA = await nextMessage(a.messages, 'presence');
    expect(presenceAtA).toMatchObject({
      actor: { id: 'user-b', kind: 'human' },
      state: { typing: true },
    });

    // ping → pong
    a.ws.send(JSON.stringify({ type: 'ping' }));
    await expect(nextMessage(a.messages, 'pong')).resolves.toEqual({ type: 'pong' });

    // internal publish: broadcast reaches the room…
    const publishToken = await signPublishToken();
    const activity = {
      action: 'task.status.changed',
      actor: { id: 'user-a', kind: 'human' },
      entityVersion: 3,
      eventId: 'evt-1',
      expiresAt: new Date().toISOString(),
      occurredAt: new Date().toISOString(),
      phase: 'committed',
      projectId: 'p1',
      target: { anchor: 'status', entityId: 't1', entityType: 'task' },
      workspaceId: 'ws-1',
    };
    const broadcastRes = await fetch(`http://127.0.0.1:${port}/internal/publish`, {
      body: JSON.stringify({
        publish: { kind: 'broadcast', message: { event: activity, type: 'activity' } },
        room: 'task:t1',
      }),
      headers: { authorization: `Bearer ${publishToken}`, 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(broadcastRes.status).toBe(202);
    await expect(nextMessage(a.messages, 'activity')).resolves.toMatchObject({
      event: { eventId: 'evt-1' },
    });

    // …and a kick sends revoked then closes the socket
    const kickRes = await fetch(`http://127.0.0.1:${port}/internal/publish`, {
      body: JSON.stringify({
        publish: { kind: 'kick', reason: 'workspace.member.removed', userId: 'user-b' },
        room: 'workspace:ws-1',
      }),
      headers: { authorization: `Bearer ${publishToken}`, 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(kickRes.status).toBe(202);
    await expect(nextMessage(b.messages, 'revoked')).resolves.toEqual({
      reason: 'workspace.member.removed',
      type: 'revoked',
    });
    await new Promise<void>((resolve) => {
      b.ws.once('close', () => resolve());
      setTimeout(resolve, 1000);
    });

    // user-a's connection survives a kick aimed at user-b
    a.ws.send(JSON.stringify({ type: 'ping' }));
    await expect(nextMessage(a.messages, 'pong')).resolves.toEqual({ type: 'pong' });

    a.ws.close();
  });

  it('rejects unauthenticated internal publish', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/internal/publish`, {
      body: JSON.stringify({
        publish: { kind: 'broadcast', message: { type: 'pong' } },
        room: 'task:t1',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });
});
