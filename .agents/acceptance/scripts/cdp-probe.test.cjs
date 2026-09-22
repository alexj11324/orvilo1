const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { buildSnapshotScript } = require('./cdp-snapshot.cjs');
const { buildProbe } = require('./cdp-dom-probe.cjs');

const rect = ({ x, y, width, height }) => ({
  x,
  y,
  width,
  height,
  top: y,
  right: x + width,
  bottom: y + height,
  left: x,
});

const runInFixture = async (expressionBuilder) => {
  const { Window } = await import('happy-dom');
  const page = new Window();
  const { document } = page;
  document.title = 'probe fixture';
  document.body.innerHTML = `
    <div id="capsule" role="button">
      <div id="chip">
        <svg id="calendar" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path id="calendar-path" d="M3 2v12M13 2v12M2 5h12" stroke="currentColor"></path>
        </svg>
        <span id="label">Properties</span>
      </div>
    </div>
    <div id="dead">Properties</div>
  `;

  Object.defineProperty(page, 'innerWidth', { configurable: true, value: 800 });
  Object.defineProperty(page, 'innerHeight', { configurable: true, value: 600 });
  Object.defineProperty(page, 'devicePixelRatio', { configurable: true, value: 2 });

  const styles = new WeakMap();
  const pseudoStyles = new Map();
  const rects = new WeakMap();
  const key = (element, pseudo) => `${element.id || element.tagName}:${pseudo}`;
  const defaults = {
    color: 'rgb(17, 17, 17)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    font: '13px Inter',
    fontFamily: 'Inter',
    fontSize: '13px',
    fontWeight: '400',
    fontStyle: 'normal',
    fontVariant: 'normal',
    fontStretch: '100%',
    lineHeight: '16px',
    letterSpacing: 'normal',
    display: 'block',
    position: 'static',
    padding: '0px',
    paddingTop: '0px',
    paddingRight: '0px',
    paddingBottom: '0px',
    paddingLeft: '0px',
    margin: '0px',
    borderRadius: '0px',
    borderTopLeftRadius: '0px',
    borderTopRightRadius: '0px',
    borderBottomRightRadius: '0px',
    borderBottomLeftRadius: '0px',
    gap: '0px',
    rowGap: '0px',
    columnGap: '0px',
    opacity: '1',
    visibility: 'visible',
    cursor: 'default',
    pointerEvents: 'auto',
    fill: 'none',
    stroke: 'none',
    fillOpacity: '1',
    strokeOpacity: '1',
    strokeWidth: '1',
    fillRule: 'nonzero',
    clipRule: 'nonzero',
    content: 'none',
    width: 'auto',
    height: 'auto',
  };

  const byId = (id) => document.getElementById(id);
  const setStyle = (id, value) => styles.set(byId(id), { ...defaults, ...value });
  setStyle('capsule', {
    display: 'flex',
    borderRadius: '8px',
    padding: '8px',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '500',
  });
  setStyle('chip', {
    display: 'inline-flex',
    borderRadius: '9999px',
    borderTopLeftRadius: '9999px',
    borderTopRightRadius: '9999px',
    borderBottomRightRadius: '9999px',
    borderBottomLeftRadius: '9999px',
    padding: '3px 6px',
    paddingTop: '3px',
    paddingRight: '6px',
    paddingBottom: '3px',
    paddingLeft: '6px',
    gap: '4px',
    rowGap: '4px',
    columnGap: '4px',
    fontFamily: 'Inter',
    fontSize: '13px',
    fontWeight: '500',
    lineHeight: '16px',
  });
  setStyle('calendar', { display: 'block', width: '16px', height: '16px', fill: 'none' });
  setStyle('calendar-path', { display: 'inline', fill: 'none', stroke: 'currentColor' });
  setStyle('label', { display: 'inline', fontSize: '13px', fontWeight: '500' });
  setStyle('dead', { display: 'block', fontSize: '13px', fontWeight: '400' });
  pseudoStyles.set(key(byId('capsule'), '::before'), {
    ...defaults,
    content: '"calendar"',
    display: 'block',
    width: '12px',
    height: '12px',
    backgroundImage: 'none',
  });

  const setRect = (id, value) => {
    const element = byId(id);
    rects.set(element, rect(value));
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => rects.get(element),
    });
    if (!/^SVG|PATH|CIRCLE|RECT|LINE|POLYGON|POLYLINE|ELLIPSE|G$/.test(element.tagName)) {
      Object.defineProperty(element, 'offsetParent', {
        configurable: true,
        value: document.body,
      });
    }
  };
  setRect('capsule', { x: 20, y: 20, width: 160, height: 36 });
  setRect('chip', { x: 28.5, y: 24.25, width: 92.5, height: 28 });
  setRect('calendar', { x: 32.5, y: 30, width: 16, height: 16 });
  setRect('calendar-path', { x: 32.5, y: 30, width: 16, height: 16 });
  setRect('label', { x: 52.5, y: 30, width: 60.5, height: 16 });
  setRect('dead', { x: 20, y: 70, width: 90, height: 20 });
  document.elementFromPoint = () => null;

  const getComputedStyle = (element, pseudo) =>
    pseudo
      ? pseudoStyles.get(key(element, pseudo)) || { ...defaults }
      : styles.get(element) || { ...defaults };
  const context = vm.createContext({
    document,
    window: page,
    location: { href: 'http://fixture.test/' },
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 2,
    getComputedStyle,
  });
  return vm.runInContext(expressionBuilder(), context);
};

test('snapshot retains nested pills, textless SVG icon geometry, pseudo content, and static behavior limits', async () => {
  const snapshot = await runInFixture(() => buildSnapshotScript({ maxElements: 100 }));
  const element = (id) => snapshot.elements.find((item) => item.id === id);
  const capsule = element('capsule');
  const chip = element('chip');
  const svg = element('calendar');
  const path = element('calendar-path');
  const dead = element('dead');

  assert.ok(capsule, 'outer rolebutton layer should be present');
  assert.ok(chip, 'inner pill layer should be present');
  assert.equal(chip.parent, capsule.i, 'the inner pill should remain paired to its outer control');
  assert.equal(capsule.style.borderRadius, '8px');
  assert.equal(chip.style.borderRadius, '9999px');
  assert.equal(chip.style.borderTopLeftRadius, '9999px');
  assert.equal(chip.style.fontSize, '13px');
  assert.equal(chip.style.fontWeight, '500');
  assert.equal(chip.style.padding, '3px 6px');
  assert.equal(chip.style.gap, '4px');
  assert.equal(chip.fractionalBox.x, 28.5);
  assert.equal(chip.fractionalBox.height, 28);

  assert.ok(svg, 'textless SVG should not be pruned');
  assert.equal(svg.svg.viewBox, '0 0 16 16');
  assert.equal(svg.svg.geometry.width, '16');
  assert.ok(path, 'SVG path should be present as its own measured element');
  assert.equal(path.svg.path, 'M3 2v12M13 2v12M2 5h12');
  assert.equal(path.svg.viewBox, '0 0 16 16');
  assert.equal(path.paint.computedStroke, 'currentColor');
  assert.equal(capsule.pseudo.before.content, '"calendar"');

  assert.equal(capsule.behavior.nearestInteractiveAncestor.id, 'capsule');
  assert.equal(capsule.behavior.interactionVerification, 'not-tested');
  assert.equal(capsule.interactionVerification, 'not-tested');
  assert.equal(dead.behavior.hasOnClick, false);
  assert.equal(dead.behavior.nearestInteractiveAncestor, null);
  assert.equal(dead.behavior.interactionVerification, 'not-tested');
  assert.equal(snapshot.meta.interactionVerification, 'not-tested');
});

test('dom probe keeps a textless SVG in triage structure while exposing full elements', async () => {
  const probe = await runInFixture(() => buildProbe(12, 100));
  const icon = probe.visualNodes.find((item) => item.id === 'calendar');
  assert.ok(icon, 'visualNodes should include the calendar SVG');
  assert.equal(icon.svg.viewBox, '0 0 16 16');
  assert.equal(icon.svg.geometry.width, '16');
  assert.ok(probe.elements.some((item) => item.id === 'chip'));
  assert.equal(probe.interactionVerification, 'not-tested');
});
