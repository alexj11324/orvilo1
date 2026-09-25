/**
 * Minimal CDP client (Node's built-in WebSocket, no dependencies). Every call
 * runs under one overall deadline — including connect and navigation — because
 * a frozen background tab makes CDP commands hang forever instead of failing.
 */

interface CdpTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

const withDeadline = <T>(ms: number, label: string, work: Promise<T>) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: no answer within ${ms}ms`)), ms).unref(),
    ),
  ]);

const httpJson = async <T>(port: number, pathname: string): Promise<T> =>
  (
    await fetch(`http://127.0.0.1:${port}${pathname}`, { signal: AbortSignal.timeout(5000) })
  ).json();

export const listTargets = (port: number) => httpJson<CdpTarget[]>(port, '/json/list');

const connect = async (wsUrl: string) => {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map<number, (value: any) => void>();
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(String(event.data));
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)!(data);
      pending.delete(data.id);
    }
  });
  const send = (method: string, params: object = {}) =>
    new Promise<any>((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { close: () => ws.close(), send };
};

const findPage = async (port: number, match: string) => {
  const page = (await listTargets(port)).find((t) => t.type === 'page' && t.url.includes(match));
  if (!page) throw new Error(`no page on :${port} whose URL contains "${match}"`);
  return page;
};

export interface EvalOptions {
  screenshot?: string;
  timeoutMs?: number;
  /** `WIDTHxHEIGHT`, emulated at DPR 2 for this session only. */
  viewport?: string;
}

/** Evaluate an expression in the first page whose URL contains `match`. */
export const evaluate = (
  port: number,
  match: string,
  expression: string,
  options: EvalOptions = {},
) =>
  withDeadline(
    options.timeoutMs ?? 30_000,
    'cdp eval',
    (async () => {
      const page = await findPage(port, match);
      const session = await connect(page.webSocketDebuggerUrl);
      try {
        if (options.viewport) {
          const [width, height] = options.viewport.split('x').map(Number);
          await session.send('Emulation.setDeviceMetricsOverride', {
            deviceScaleFactor: 2,
            height,
            mobile: false,
            width,
          });
          await new Promise((r) => setTimeout(r, 1000));
        }
        const result = await session.send('Runtime.evaluate', {
          awaitPromise: true,
          expression,
          returnByValue: true,
        });
        if (result.result?.exceptionDetails) {
          throw new Error(JSON.stringify(result.result.exceptionDetails).slice(0, 600));
        }
        let screenshot: Buffer | undefined;
        if (options.screenshot) {
          const shot = await session.send('Page.captureScreenshot', { format: 'png' });
          screenshot = Buffer.from(shot.result.data, 'base64');
        }
        return { screenshot, url: page.url, value: result.result?.result?.value };
      } finally {
        session.close();
      }
    })(),
  );

/** Reload every `app://renderer` page so it re-fetches from the current Vite origin. */
export const reloadRendererPages = (port: number) =>
  withDeadline(
    20_000,
    'reload',
    (async () => {
      const pages = (await listTargets(port)).filter(
        (t) => t.type === 'page' && t.url.startsWith('app://renderer'),
      );
      for (const page of pages) {
        const session = await connect(page.webSocketDebuggerUrl);
        await session.send('Page.reload', { ignoreCache: true });
        // Return only once the new document has loaded, so a follow-up command
        // does not evaluate in a context that is about to be destroyed.
        await new Promise((r) => setTimeout(r, 300));
        for (let ready = false; !ready; await new Promise((r) => setTimeout(r, 250))) {
          const state = await session.send('Runtime.evaluate', {
            expression: 'document.readyState',
            returnByValue: true,
          });
          ready = state.result?.result?.value === 'complete';
        }
        session.close();
      }
      return pages.map((p) => p.url);
    })(),
  );

const browserSession = async (port: number) =>
  connect(
    (await httpJson<{ webSocketDebuggerUrl: string }>(port, '/json/version')).webSocketDebuggerUrl,
  );

/**
 * Open a foreground window in an already-running browser (shares its profile and
 * sign-ins). Background tabs get frozen, so reference measurements need this.
 */
export const openWindow = (port: number, url: string) =>
  withDeadline(
    15_000,
    'open window',
    (async () => {
      const session = await browserSession(port);
      const res = await session.send('Target.createTarget', {
        height: 990,
        newWindow: true,
        url,
        width: 1440,
      });
      session.close();
      if (!res.result?.targetId) throw new Error(JSON.stringify(res.error ?? res));
      return res.result.targetId as string;
    })(),
  );

export const closeTarget = async (port: number, targetId: string) => {
  const res = await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`, {
    signal: AbortSignal.timeout(5000),
  });
  return res.ok;
};
