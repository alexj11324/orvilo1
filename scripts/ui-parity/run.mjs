import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertAuthorizedScenario } from './authorization.mjs';
import { compareSequences, transition } from './compare.mjs';
import { installEventTrace } from './events.mjs';
import {
  normalizeLocationRoute,
  parseActions,
  routeMappingsForSurface,
  validateSurfaceMappings,
} from './scenario.mjs';
import { createStabilityWindow } from './stability.mjs';
import { isPendingIndicator, partitionPending, selectTargets } from './targets.mjs';

// Executed inside each actual renderer. No framework or application store assumptions.
function observe(
  action,
  mappings,
  routeMappings,
  inspectTarget,
  selectTargets,
  isPendingIndicator,
  partitionPending,
  readinessScope,
  arm,
  installEventTrace,
  normalizeLocationRoute,
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
    if (valid && arm) {
      window.__parityEventTrace?.stop();
      window.__parityEventTrace = installEventTrace(document, element);
    }
    return { valid, x, y, target: summary(element), hit: hit ? summary(hit) : null };
  }
  const pending = partitionPending(
    elements('[aria-busy="true"],[role="progressbar"]').filter(isPendingIndicator),
    root,
  );
  return {
    route: normalizeLocationRoute(location.pathname, location.search, location.hash, routeMappings),
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
async function record(surface, actions, directory) {
  const client = await connect(surface);
  const routeMappings = routeMappingsForSurface(surface);
  const sample = (action, target = false, arm = false) =>
    client.evaluate(
      `(${observe.toString()})(${JSON.stringify(action)},${JSON.stringify(surface.mappings || [])},${JSON.stringify(routeMappings)},${target},${selectTargets.toString()},${isPendingIndicator.toString()},${partitionPending.toString()},${JSON.stringify(surface.readinessScope || null)},${arm},${installEventTrace.toString()},${normalizeLocationRoute.toString()})`,
    );
  try {
    await client.send('Page.enable');
    await client.send('Page.bringToFront');
    let navigationMarker = crypto.randomUUID();
    await client.evaluate(`window.__parityNavigationMarker = ${JSON.stringify(navigationMarker)}`);
    await client.send('Page.navigate', { url: surface.start });
    const capture = async (name) => {
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(directory, `${name}.png`), Buffer.from(shot.data, 'base64'));
    };
    const markerRemains = (marker) =>
      client.evaluate(`window.__parityNavigationMarker === ${JSON.stringify(marker)}`);
    const readiness = async (state) =>
      !state.busy && (await client.evaluate('document.readyState === "complete"'));
    const establishBaseline = async (action, imageName, marker) => {
      const stable = createStabilityWindow();
      const deadline = Date.now() + 30000;
      let target;
      while (Date.now() < deadline) {
        try {
          if (marker && (await markerRemains(marker))) {
            stable(null, false, Date.now());
            await delay();
            continue;
          }
          target = action.type === 'click' ? await sample(action, true) : null;
          const state = await sample(action);
          const ready = (action.type !== 'click' || target.valid) && (await readiness(state));
          const value = { state, target: target?.target || null };
          if (stable(value, ready, Date.now())) {
            await capture(imageName);
            const confirmedTarget = action.type === 'click' ? await sample(action, true) : null;
            const confirmed = await sample(action);
            const confirmedValue = { state: confirmed, target: confirmedTarget?.target || null };
            if (
              (action.type !== 'click' || confirmedTarget.valid) &&
              (await readiness(confirmed)) &&
              JSON.stringify(confirmedValue) === JSON.stringify(value)
            ) {
              return { before: confirmed, target: confirmedTarget };
            }
            stable(null, false, Date.now());
          }
        } catch {
          stable(null, false, Date.now());
          /* Navigation can destroy the old execution context. */
        }
        await delay();
      }
      throw new Error(target?.reason || 'Action baseline never stabilized');
    };
    const establishAfter = async (action, before, marker, requireChange) => {
      const stable = createStabilityWindow();
      const deadline = Date.now() + 30000;
      const samples = [];
      let after = before;
      while (Date.now() < deadline) {
        try {
          if (marker && (await markerRemains(marker))) {
            stable(null, false, Date.now());
            await delay();
            continue;
          }
          after = await sample(action);
          samples.push(after);
          const changed = JSON.stringify(before) !== JSON.stringify(after);
          if (stable(after, (await readiness(after)) && (!requireChange || changed), Date.now()))
            return { after, samples, settled: true };
        } catch {
          stable(null, false, Date.now());
          /* Navigation can destroy the old execution context. */
        }
        await delay();
      }
      return { after, samples, settled: false };
    };

    const results = [];
    for (const [index, action] of actions.entries()) {
      const prefix = actions.length === 1 ? '' : `step-${String(index + 1).padStart(2, '0')}-`;
      const baseline = await establishBaseline(action, `${prefix}before`, navigationMarker);
      navigationMarker = null;
      if (index === 0) {
        const expected = new URL(surface.start);
        const actual = await client.evaluate('location.pathname + location.search + location.hash');
        if (expected.pathname + expected.search + expected.hash !== actual)
          throw new Error('Unexpected starting route');
      }

      let result;
      if (action.type === 'reload') {
        const reloadMarker = crypto.randomUUID();
        await client.evaluate(`window.__parityNavigationMarker = ${JSON.stringify(reloadMarker)}`);
        await client.send('Page.reload');
        const observed = await establishAfter(action, baseline.before, reloadMarker, false);
        await capture(`${prefix}after`);
        result = {
          actionType: 'reload',
          actionVerified: !(await markerRemains(reloadMarker)),
          before: baseline.before,
          after: observed.after,
          samples: observed.samples,
          settled: observed.settled,
          changed: JSON.stringify(baseline.before) !== JSON.stringify(observed.after),
          effect: transition(baseline.before, observed.after),
        };
      } else {
        // Re-resolve and arm immediately before dispatch: earlier rectangles may have gone stale.
        const target = await sample(action, true, true);
        if (!target.valid) throw new Error(target.reason || 'Target changed before click');
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
        let eventTrace = null;
        try {
          eventTrace = await client.evaluate('window.__parityEventTrace?.read() ?? null');
        } catch {
          /* A document navigation loses the witness and must remain inconclusive. */
        }
        const observed = await establishAfter(action, baseline.before, null, true);
        await capture(`${prefix}after`);
        result = {
          actionType: 'click',
          actionVerified:
            target.valid && !!eventTrace?.click?.trusted && !!eventTrace?.click?.matched,
          before: baseline.before,
          after: observed.after,
          target,
          event: eventTrace?.click || null,
          eventTrace,
          samples: observed.samples,
          hitVerified: target.valid,
          eventVerified: !!eventTrace?.click?.trusted && !!eventTrace?.click?.matched,
          settled: observed.settled,
          changed: JSON.stringify(baseline.before) !== JSON.stringify(observed.after),
          effect: transition(baseline.before, observed.after),
        };
      }
      results.push(result);
      if (!result.actionVerified || !result.settled) break;
    }
    await writeFile(
      path.join(directory, 'trace.json'),
      JSON.stringify(actions.length === 1 ? results[0] : { steps: results }, null, 2),
    );
    return results;
  } finally {
    try {
      await client.evaluate('window.__parityEventTrace?.stop(); delete window.__parityEventTrace');
    } catch {
      /* The last action may already have destroyed its execution context. */
    }
    client.close();
  }
}

const [configFile, output] = process.argv.slice(2);
if (!configFile || !output)
  throw new Error('Usage: node scripts/ui-parity/run.mjs scenario.json output-directory');
const config = JSON.parse(await readFile(configFile, 'utf8'));
const actions = parseActions(config);
validateSurfaceMappings(config.reference, 'reference');
validateSurfaceMappings(config.candidate, 'candidate');
assertAuthorizedScenario(config, actions);
const runs = {};
const sequences = {};
for (const side of ['reference', 'candidate']) {
  const directory = path.join(output, side);
  await mkdir(directory, { recursive: true });
  try {
    sequences[side] = await record(config[side], actions, directory);
    runs[side] = actions.length === 1 ? sequences[side][0] : sequences[side];
  } catch (error) {
    runs[side] = { error: String(error) };
    sequences[side] = runs[side];
  }
}
const verdict = compareSequences(sequences.reference, sequences.candidate);
await writeFile(
  path.join(output, 'comparison.json'),
  JSON.stringify({ scenario: config, runs, verdict }, null, 2),
);
console.log(JSON.stringify(verdict, null, 2));
process.exitCode =
  verdict.verdict === 'observed-match' ? 0 : verdict.verdict === 'different' ? 1 : 2;
