import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { compareTransitions, transition } from './compare.mjs';
import { isPendingIndicator, partitionPending, selectTargets } from './targets.mjs';

// Executed inside each actual renderer. No framework or application store assumptions.
function observe(
  action,
  mappings,
  inspectTarget,
  selectTargets,
  isPendingIndicator,
  partitionPending,
  readinessScope,
) {
  const visible = (element) => {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility === 'visible' &&
      style.display !== 'none'
    );
  };
  const normalize = (value) =>
    mappings.reduce((text, [from, to]) => text.split(from).join(to), value);
  const name = (element) =>
    normalize(
      (
        element.getAttribute('aria-label') ||
        element.getAttribute('placeholder') ||
        element.innerText ||
        ''
      )
        .trim()
        .replaceAll(/\s+/g, ' '),
    );
  const summary = (element) => ({
    tag: element.tagName,
    role: element.getAttribute('role'),
    text: name(element),
    rect: element.getBoundingClientRect().toJSON(),
  });
  const elements = (selector) => [...document.querySelectorAll(selector)].filter(visible);
  const roots = readinessScope ? elements(readinessScope) : [document.documentElement];
  if (roots.length !== 1)
    throw new Error(`Expected one visible readiness scope, found ${roots.length}`);
  const root = roots[0];
  const values = (selector) =>
    elements(selector)
      .map(
        (element) =>
          `${element.getAttribute('role') || element.tagName.toLowerCase()}:${name(element)}`,
      )
      .sort();
  if (inspectTarget) {
    const names = action.names;
    const matches = selectTargets(
      elements(action.selector || 'button,a,input,textarea,[role],div,span,p').filter((element) =>
        names.includes(name(element)),
      ),
    );
    if (matches.length !== 1)
      return {
        valid: false,
        reason: `Expected one visible semantic target, found ${matches.length}`,
      };
    const element = matches[0];
    if (!root.contains(element))
      return { valid: false, reason: 'Target is outside readiness scope' };
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const valid =
      !!hit &&
      element.tagName !== 'HTML' &&
      element.tagName !== 'BODY' &&
      (hit === element || element.contains(hit));
    if (valid) {
      window.__parityClick = null;
      document.addEventListener(
        'click',
        (event) => {
          window.__parityClick = {
            trusted: event.isTrusted,
            matched: event.composedPath().includes(element),
            target: summary(event.target),
          };
        },
        { capture: true, once: true },
      );
    }
    return { valid, x, y, target: summary(element), hit: hit ? summary(hit) : null };
  }
  const pending = partitionPending(
    elements('[aria-busy="true"],[role="progressbar"]').filter(isPendingIndicator),
    root,
  );
  return {
    route: normalize(location.pathname + location.search + location.hash),
    dialogs: values('[role="dialog"],[role="alertdialog"],dialog[open]'),
    menus: values('[role="menu"],[role="listbox"]'),
    editors: elements(
      'textarea,input:not([type="hidden"]),[contenteditable="true"],[role="textbox"]',
    )
      .map(
        (element) =>
          `${element.type === 'checkbox' ? 'checkbox' : 'textbox'}:${normalize(element.getAttribute('aria-label') || element.getAttribute('placeholder') || '')}`,
      )
      .sort(),
    selected: values('[aria-selected="true"],[aria-checked="true"],[aria-pressed="true"]'),
    expanded: values('[aria-expanded="true"]'),
    focus:
      document.activeElement && !['BODY', 'HTML'].includes(document.activeElement.tagName)
        ? `${document.activeElement.matches('textarea,input,[contenteditable="true"]') ? 'textbox' : document.activeElement.getAttribute('role') || document.activeElement.tagName.toLowerCase()}:${name(document.activeElement)}`
        : '',
    busy: pending.inside.length,
    outsideBusy: pending.outside.map(summary),
  };
}

async function connect(surface) {
  const targets = await (
    await fetch(`${surface.cdp}/json/list`, { signal: AbortSignal.timeout(5000) })
  ).json();
  const matches = targets.filter(
    (target) => target.type === 'page' && target.url.startsWith(surface.match),
  );
  if (matches.length !== 1)
    throw new Error(`Expected one ${surface.match} tab, found ${matches.length}`);
  const socket = new WebSocket(matches[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
    setTimeout(() => reject(new Error('CDP connection timeout')), 5000).unref();
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      callback(message);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new Error(`${method} timed out`));
      }, 10000);
      pending.set(key, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      });
      socket.send(JSON.stringify({ id: key, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, evaluate, close: () => socket.close() };
}

const delay = () => new Promise((resolve) => setTimeout(resolve, 250));
async function record(surface, action, directory) {
  const client = await connect(surface);
  const sample = (target = false) =>
    client.evaluate(
      `(${observe.toString()})(${JSON.stringify(action)},${JSON.stringify(surface.mappings || [])},${target},${selectTargets.toString()},${isPendingIndicator.toString()},${partitionPending.toString()},${JSON.stringify(surface.readinessScope || null)})`,
    );
  try {
    await client.send('Page.enable');
    await client.send('Page.bringToFront');
    const navigationMarker = crypto.randomUUID();
    await client.evaluate(`window.__parityNavigationMarker = ${JSON.stringify(navigationMarker)}`);
    await client.send('Page.navigate', { url: surface.start });
    const deadline = Date.now() + 30000;
    let target;
    while (Date.now() < deadline) {
      try {
        // A same-URL reload can briefly leave the old DOM queryable after Page.navigate returns.
        // Do not use those controls as proof that the requested start document is ready.
        if (
          await client.evaluate(
            `window.__parityNavigationMarker === ${JSON.stringify(navigationMarker)}`,
          )
        ) {
          await delay();
          continue;
        }
        target = await sample(true);
        if (target.valid) break;
      } catch {
        /* Navigation can destroy the old execution context. */
      }
      await delay();
    }
    if (!target?.valid) throw new Error(target?.reason || 'Target never became ready');
    const before = await sample();
    if (new URL(surface.start).pathname !== (await client.evaluate('location.pathname')))
      throw new Error('Unexpected starting route');
    const capture = async (name) => {
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(directory, `${name}.png`), Buffer.from(shot.data, 'base64'));
    };
    await capture('before');
    // Re-resolve immediately before dispatch: earlier rectangles may have gone stale.
    target = await sample(true);
    if (!target.valid) throw new Error('Target changed before click');
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: target.x,
      y: target.y,
      button: 'left',
      clickCount: 1,
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: target.x,
      y: target.y,
      button: 'left',
      clickCount: 1,
    });
    const event = await client.evaluate('window.__parityClick');
    const samples = [];
    let previous = '';
    let stableSince = Date.now();
    let settled = false;
    let after = before;
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      await delay();
      after = await sample();
      samples.push(after);
      const signature = JSON.stringify(after);
      if (signature !== previous || after.busy) stableSince = Date.now();
      previous = signature;
      if (signature !== JSON.stringify(before) && Date.now() - stableSince >= 1500) {
        settled = true;
        break;
      }
    }
    await capture('after');
    const result = {
      before,
      after,
      target,
      event,
      samples,
      hitVerified: target.valid,
      eventVerified: !!event?.trusted && !!event?.matched,
      settled,
      changed: JSON.stringify(before) !== JSON.stringify(after),
      effect: transition(before, after),
    };
    await writeFile(path.join(directory, 'trace.json'), JSON.stringify(result, null, 2));
    return result;
  } finally {
    client.close();
  }
}

const [configFile, output] = process.argv.slice(2);
if (!configFile || !output)
  throw new Error('Usage: node scripts/ui-parity/run.mjs scenario.json output-directory');
const config = JSON.parse(await readFile(configFile, 'utf8'));
if (config.action.safety !== 'read-only')
  throw new Error('This runner only executes explicitly classified read-only actions.');
const runs = {};
for (const side of ['reference', 'candidate']) {
  const directory = path.join(output, side);
  await mkdir(directory, { recursive: true });
  try {
    runs[side] = await record(config[side], config.action, directory);
  } catch (error) {
    runs[side] = { error: String(error) };
  }
}
const verdict = compareTransitions(runs.reference, runs.candidate);
await writeFile(
  path.join(output, 'comparison.json'),
  JSON.stringify({ scenario: config, runs, verdict }, null, 2),
);
console.log(JSON.stringify(verdict, null, 2));
process.exitCode =
  verdict.verdict === 'observed-match' ? 0 : verdict.verdict === 'different' ? 1 : 2;
