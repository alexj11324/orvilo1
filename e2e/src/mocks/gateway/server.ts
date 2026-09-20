/**
 * Fake Agent Gateway for E2E.
 *
 * After the browser client runtime was retired, web chat runs in gateway mode:
 * the Orvilo server executes the agent in-process and pushes stream events to
 * the Agent Gateway over HTTP; the browser subscribes to those events over a
 * WebSocket on the gateway. The real gateway is a hosted Cloudflare service —
 * this fake implements the exact wire surface the client/server use so E2E
 * exercises the real transport and persistence paths:
 *
 *  Server → fake gateway (Bearer AGENT_GATEWAY_SERVICE_TOKEN):
 *    POST /api/operations/init          { operationId, userId, meta? }
 *    POST /api/operations/push-event    { operationId, event }
 *    POST /api/operations/tool-execute  { operationId, data }   → fanned out as
 *                                         a `tool_execute` agent_event
 *
 *  Server → fake gateway (device dispatch — the fake gateway IS the device):
 *    POST /api/device/agent/run         agent_run_request → synthesized `lh
 *                                         hetero exec` turn: mock-LLM reply
 *                                         streamed back through the real
 *                                         aiAgent.heteroIngest/heteroFinish
 *                                         pipeline (see fakeDevice.ts)
 *
 *  Browser → fake gateway:
 *    WS /ws?operationId=...
 *      ← {type:'auth'}            → {type:'auth_success'}
 *      ← {type:'resume'}          → buffered {type:'agent_event'} replay +
 *                                  {type:'resume_complete', status}
 *      ← {type:'heartbeat'}       → {type:'heartbeat_ack'}
 *      ← {type:'tool_result'}     → POST {orvilo}/api/agent/tool-result
 *      ← {type:'interrupt'}       → no-op (web clients cancel via tRPC)
 *
 * Runs under Bun (`bun e2e/scripts/mockServices.ts`) for the built-in WS.
 */

import { type DeviceAgentRunRequest, runSyntheticHeteroTurn } from './fakeDevice';

interface BufferedEvent {
  event: Record<string, unknown>;
  id: string;
}

interface OperationState {
  events: BufferedEvent[];
  status:
    'completed' | 'error' | 'interrupted' | 'running' | 'waiting_confirmation' | 'waiting_input';
}

type WsData = { operationId: string };

// Bun's WebSocket type is only available under Bun; keep this module's type
// surface minimal so it also parses under tsx for editor/type-checking.
interface WsLike {
  data: WsData;
  send: (data: string) => void;
}

/**
 * `agent_runtime_end.data.reason` → stored session status. Only hard-terminal
 * reasons map to terminal statuses: `waiting_for_async_tool` means the run is
 * parked awaiting a deferred tool, so a reconnecting client must see it as
 * still running (matching the real gateway's `waiting_*` semantics).
 */
const STATUS_BY_END_REASON: Record<string, OperationState['status']> = {
  completed: 'completed',
  error: 'error',
  interrupted: 'interrupted',
  waiting_for_async_tool: 'waiting_input',
};

export const MOCK_GATEWAY_PORT = Number(process.env.E2E_MOCK_GATEWAY_PORT || 3407);

export interface FakeGatewayOptions {
  /** Mock LLM base URL — where synthesized device turns fetch reply text. */
  llmBaseUrl?: string;
  /**
   * Orvilo server base URL — where `tool_result` WS messages are forwarded
   * (`POST /api/agent/tool-result`) and synthesized device turns ingest
   * (`/trpc/lambda/aiAgent.hetero*`). Defaults to the E2E server port.
   */
  orviloBaseUrl?: string;
  /** Bearer token the Orvilo server uses for /api/operations/* pushes. */
  serviceToken?: string;
}

export const startFakeGateway = (
  port = MOCK_GATEWAY_PORT,
  options: FakeGatewayOptions = {},
): unknown => {
  const orviloBaseUrl = options.orviloBaseUrl ?? 'http://localhost:3006';
  const llmBaseUrl =
    options.llmBaseUrl ?? `http://localhost:${process.env.E2E_MOCK_LLM_PORT || 3406}`;
  // Default matches the token setup.ts / e2e.yml hand to the Orvilo server.
  const serviceToken =
    options.serviceToken ?? process.env.AGENT_GATEWAY_SERVICE_TOKEN ?? 'e2e-mock-service-token';

  const operations = new Map<string, OperationState>();
  const subscribers = new Map<string, Set<WsLike>>();
  let nextEventId = 1;
  let lastDispatchedDeviceId = '';

  const pushToSubscribers = (operationId: string, message: Record<string, unknown>) => {
    const subs = subscribers.get(operationId);
    if (!subs) return;
    const raw = JSON.stringify(message);
    for (const ws of subs) ws.send(raw);
  };

  const recordEvent = (operationId: string, event: Record<string, unknown>): string => {
    let op = operations.get(operationId);
    if (!op) {
      op = { events: [], status: 'running' };
      operations.set(operationId, op);
    }
    const id = String(nextEventId++);
    op.events.push({ event, id });
    // Cap the replay buffer — long runs only need recent history for reconnect.
    if (op.events.length > 500) op.events.splice(0, op.events.length - 500);

    // Mirrored member events ride a supervisor's channel while keeping their
    // own operationId — only this op's own terminal flips its stored status,
    // else a member finishing would false-complete the supervisor on resume.
    const ownEvent = !event.operationId || event.operationId === operationId;
    if (ownEvent && event.type === 'agent_runtime_end') {
      const reason = (event.data as Record<string, unknown> | undefined)?.reason;
      op.status = STATUS_BY_END_REASON[String(reason ?? 'completed')] ?? 'completed';
    } else if (ownEvent && event.type === 'error') {
      op.status = 'error';
    }
    return id;
  };

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
      status,
    });

  const Bun_ = (globalThis as any).Bun;
  if (!Bun_) throw new Error('Fake gateway requires Bun (Bun.serve websocket support)');

  const server = Bun_.serve({
    fetch(req: Request, srv: any) {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/ws') {
        const operationId = url.searchParams.get('operationId') ?? '';
        if (srv.upgrade(req, { data: { operationId } })) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      if (req.method === 'GET' && path === '/health') {
        return json({ ok: true });
      }

      // Diagnostics ledger: `GET /api/operations/:id` returns what the gateway
      // recorded for that op — the recorded event types, derived status and
      // live subscriber count. Lets a failure dump distinguish "the server
      // never pushed agent_runtime_end" from "the client received but
      // mishandled it" when an op is stuck `running`.
      if (req.method === 'GET' && path.startsWith('/api/operations/')) {
        const operationId = path.split('/').pop() ?? '';
        const op = operations.get(operationId);
        if (!op) return json({ error: 'unknown operation' }, 404);
        return json({
          eventTypes: op.events.map(({ event }) => String(event.type)),
          status: op.status,
          subscribers: subscribers.get(operationId)?.size ?? 0,
        });
      }

      // The real gateway requires the service token on server pushes —
      // enforce it when configured so a missing AGENT_GATEWAY_SERVICE_TOKEN
      // on the Orvilo side can't false-green the suite.
      if (
        path.startsWith('/api/operations/') &&
        serviceToken &&
        req.headers.get('authorization') !== `Bearer ${serviceToken}`
      ) {
        return json({ error: 'unauthorized' }, 401);
      }

      // Device presence reads: the runtime bar / device pool queries the
      // gateway for online devices. Report the last dispatched device (falling
      // back to the seeded e2e device) as online so bound-device surfaces read
      // truthfully — a 404 here used to read as "all devices offline".
      if (req.method === 'POST' && path === '/api/device/status') {
        return json({ deviceCount: 1, online: true });
      }

      if (req.method === 'POST' && path === '/api/device/devices') {
        const deviceId = lastDispatchedDeviceId || 'e2e-mock-device';
        const connectedAt = new Date().toISOString();
        return json({
          devices: [
            {
              channels: [{ channel: 'default', connectedAt, connectionId: 'e2e-mock-conn' }],
              connectedAt,
              deviceId,
              hostname: 'E2E Mock Device',
              platform: 'darwin',
            },
          ],
        });
      }

      // Device dispatch channel: the server hands the gateway an
      // `agent_run_request`; a real gateway relays it to a connected device
      // running `lh hetero exec`. The fake gateway plays the device itself —
      // ack the dispatch, then stream a mock-LLM reply back through the real
      // hetero ingest pipeline so e2e sends produce a genuine assistant turn.
      if (req.method === 'POST' && path === '/api/device/agent/run') {
        return (async () => {
          const body = (await req.json()) as DeviceAgentRunRequest;
          if (!body.operationId || !body.jwt) {
            return json({ error: 'operationId and jwt required' }, 400);
          }
          if (body.deviceId) lastDispatchedDeviceId = body.deviceId;
          void runSyntheticHeteroTurn({
            llmBaseUrl,
            orviloBaseUrl,
            request: body,
          }).catch((error) => console.error('[e2e-gateway] device turn crashed:', error));
          return json({ success: true });
        })();
      }

      if (req.method === 'POST' && path === '/api/operations/init') {
        return (async () => {
          const body = (await req.json()) as { operationId?: string };
          if (!body.operationId) return json({ error: 'operationId required' }, 400);
          if (!operations.has(body.operationId)) {
            operations.set(body.operationId, { events: [], status: 'running' });
          }
          return json({ ok: true });
        })();
      }

      if (req.method === 'POST' && path === '/api/operations/push-event') {
        return (async () => {
          const body = (await req.json()) as {
            event?: Record<string, unknown>;
            operationId?: string;
          };
          if (!body.operationId || !body.event) {
            return json({ error: 'operationId and event required' }, 400);
          }
          const id = recordEvent(body.operationId, body.event);
          pushToSubscribers(body.operationId, {
            event: body.event,
            id,
            type: 'agent_event',
          });
          return json({ ok: true });
        })();
      }

      if (req.method === 'POST' && path === '/api/operations/tool-execute') {
        return (async () => {
          const body = (await req.json()) as {
            data?: Record<string, unknown>;
            operationId?: string;
          };
          if (!body.operationId || !body.data) {
            return json({ error: 'operationId and data required' }, 400);
          }
          const subs = subscribers.get(body.operationId);
          if (!subs || subs.size === 0) {
            // Mirrors a real gateway answer when no client holds the channel —
            // the server falls back to the interrupt-resume path.
            return json({ error: 'no subscriber for operation' }, 502);
          }
          const id = recordEvent(body.operationId, {
            data: body.data,
            operationId: body.operationId,
            stepIndex: 0,
            timestamp: Date.now(),
            type: 'tool_execute',
          });
          pushToSubscribers(body.operationId, {
            event: {
              data: body.data,
              operationId: body.operationId,
              stepIndex: 0,
              timestamp: Date.now(),
              type: 'tool_execute',
            },
            id,
            type: 'agent_event',
          });
          return json({ ok: true });
        })();
      }

      return json({ error: `Unknown path: ${req.method} ${path}` }, 404);
    },

    port,

    websocket: {
      close(ws: WsLike) {
        const subs = subscribers.get(ws.data.operationId);
        subs?.delete(ws);
      },
      message(ws: WsLike, raw: string | Buffer) {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(raw)) as Record<string, unknown>;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'auth': {
            ws.send(JSON.stringify({ type: 'auth_success' }));
            break;
          }
          case 'resume': {
            const op = operations.get(ws.data.operationId);
            const lastEventId = Number(msg.lastEventId || '0');
            if (op) {
              for (const buffered of op.events) {
                if (Number(buffered.id) > lastEventId) {
                  ws.send(
                    JSON.stringify({ event: buffered.event, id: buffered.id, type: 'agent_event' }),
                  );
                }
              }
            }
            ws.send(JSON.stringify({ status: op?.status ?? 'running', type: 'resume_complete' }));
            break;
          }
          case 'heartbeat': {
            ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;
          }
          case 'tool_result': {
            // Real gateway forwards client tool results into the Orvilo
            // server's Redis BLPOP via POST /api/agent/tool-result.
            void fetch(`${orviloBaseUrl}/api/agent/tool-result`, {
              body: JSON.stringify(msg),
              headers: {
                'Authorization': `Bearer ${serviceToken ?? ''}`,
                'Content-Type': 'application/json',
              },
              method: 'POST',
            }).catch((error) => console.error('[e2e-gateway] tool_result forward failed:', error));
            break;
          }
          case 'interrupt': {
            // Web clients cancel via tRPC `aiAgent.interruptTask`; nothing to do.
            break;
          }
        }
      },
      open(ws: WsLike) {
        const { operationId } = ws.data;
        let subs = subscribers.get(operationId);
        if (!subs) {
          subs = new Set();
          subscribers.set(operationId, subs);
        }
        subs.add(ws);
      },
    },
  });

  console.log(`[e2e-gateway] Fake agent gateway listening on :${port}`);
  return server;
};
