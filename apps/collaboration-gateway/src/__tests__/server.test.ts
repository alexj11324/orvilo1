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

const signRoomTicket = async (params: {
  jti?: string;
  presenceVisible?: boolean;
  room: string;
  userId: string;
}) =>
  new SignJWT({
    actor: { id: params.userId, kind: 'human' },
    presence_visible: params.presenceVisible ?? true,
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
      headers: { 'authorization': `Bearer ${publishToken}`, 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(broadcastRes.status).toBe(202);
    // The protocol-version marker is what lets the projector distinguish a
    // v2 gateway (executes scoped kicks) from a pre-v2 one (acks but drops).
    expect(broadcastRes.headers.get('x-orvilo-gateway-protocol-version')).toBe('3');
    await expect(nextMessage(a.messages, 'activity')).resolves.toMatchObject({
      event: { eventId: 'evt-1' },
    });

    // …and a kick sends revoked then closes the socket
    const kickRes = await fetch(`http://127.0.0.1:${port}/internal/publish`, {
      body: JSON.stringify({
        publish: { kind: 'kick', reason: 'workspace.member.removed', userId: 'user-b' },
        room: 'workspace:ws-1',
      }),
      headers: { 'authorization': `Bearer ${publishToken}`, 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(kickRes.status).toBe(202);
    expect(kickRes.headers.get('x-orvilo-gateway-protocol-version')).toBe('3');
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

  it('keeps a hidden human connected without publishing their presence', async () => {
    const room = 'task:hidden-presence';
    const observerToken = await signRoomTicket({ room, userId: 'user-observer' });
    const hiddenToken = await signRoomTicket({
      presenceVisible: false,
      room,
      userId: 'user-hidden',
    });
    const observer = await connect(`room=${room}&token=${observerToken}`);
    const hidden = await connect(`room=${room}&token=${hiddenToken}`);
    await nextMessage(observer.messages, 'snapshot');
    await nextMessage(hidden.messages, 'snapshot');

    hidden.ws.send(JSON.stringify({ type: 'presence', state: { typing: true } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(observer.messages.some((message) => message.type === 'presence')).toBe(false);

    // Suppression changes only outbound presence. The hidden user's read
    // socket stays healthy and continues participating in the room.
    hidden.ws.send(JSON.stringify({ type: 'ping' }));
    await expect(nextMessage(hidden.messages, 'pong')).resolves.toEqual({ type: 'pong' });

    observer.ws.close();
    hidden.ws.close();
  });

  it('immediately conceals an old visible ticket and keeps its read socket connected', async () => {
    const room = 'task:old-visible-ticket';
    const observerToken = await signRoomTicket({ room, userId: 'user-observer-2' });
    const oldVisibleToken = await signRoomTicket({ room, userId: 'user-old-visible' });
    const lateOldVisibleToken = await signRoomTicket({ room, userId: 'user-old-visible' });
    const observer = await connect(`room=${room}&token=${observerToken}`);
    const oldVisible = await connect(`room=${room}&token=${oldVisibleToken}`);
    await nextMessage(observer.messages, 'snapshot');
    await nextMessage(oldVisible.messages, 'snapshot');

    oldVisible.ws.send(JSON.stringify({ type: 'presence', state: { typing: true } }));
    await expect(nextMessage(observer.messages, 'presence')).resolves.toMatchObject({
      actor: { id: 'user-old-visible', kind: 'human' },
    });

    const concealResponse = await fetch(`http://127.0.0.1:${port}/internal/publish`, {
      body: JSON.stringify({
        publish: {
          epoch: 'hidden-epoch',
          kind: 'presence-visibility',
          userId: 'user-old-visible',
          visible: false,
        },
        room: '',
      }),
      headers: {
        'authorization': `Bearer ${await signPublishToken()}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    expect(concealResponse.status).toBe(202);
    expect(concealResponse.headers.get('x-orvilo-gateway-protocol-version')).toBe('3');
    await expect(nextMessage(observer.messages, 'presence-gone')).resolves.toMatchObject({
      type: 'presence-gone',
    });

    // This JWT was minted before conceal but did not connect until afterward.
    // The user tombstone must suppress it just like an already-open tab.
    const lateOldVisible = await connect(`room=${room}&token=${lateOldVisibleToken}`);
    await nextMessage(lateOldVisible.messages, 'snapshot');
    lateOldVisible.ws.send(JSON.stringify({ type: 'presence', state: { typing: true } }));

    oldVisible.ws.send(JSON.stringify({ type: 'presence', state: { typing: false } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(observer.messages.some((message) => message.type === 'presence')).toBe(false);

    oldVisible.ws.send(JSON.stringify({ type: 'ping' }));
    await expect(nextMessage(oldVisible.messages, 'pong')).resolves.toEqual({ type: 'pong' });

    observer.ws.close();
    oldVisible.ws.close();
    lateOldVisible.ws.close();
  });

  it('rejects malformed conceal commands', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/internal/publish`, {
      body: JSON.stringify({
        publish: { kind: 'presence-visibility', userId: ' ', visible: false },
        room: '',
      }),
      headers: {
        'authorization': `Bearer ${await signPublishToken()}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid presence visibility envelope',
    });
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

  it('closes the socket when a frame exceeds the payload cap', async () => {
    const token = await signRoomTicket({ room: 'task:t1', userId: 'user-big' });
    const conn = await connect(`room=task:t1&token=${token}`);
    await nextMessage(conn.messages, 'snapshot');

    // >64KiB frame — ws maxPayload terminates the connection with 1009
    // instead of feeding the buffer to JSON.parse.
    conn.ws.send(JSON.stringify({ state: { typing: 'x'.repeat(128 * 1024) }, type: 'presence' }));
    const code = await new Promise<number>((resolve) => {
      conn.ws.once('close', (closeCode) => resolve(closeCode));
    });
    expect(code).toBe(1009);
  });
});
