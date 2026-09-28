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
          <line id="thin-line" x1="8" y1="0" x2="8" y2="20" stroke="currentColor"></line>
        </svg>
        <span id="label">Properties</span>
      </div>
    </div>
    <div id="dead">Properties</div>
    <button id="latent-control" aria-label="Assign owner">
      <span id="latent-opacity-wrapper">
        <svg id="latent-icon" aria-label="No owner" width="16" height="16" viewBox="0 0 16 16">
          <path id="latent-icon-path" d="M2 8h12"></path>
        </svg>
        <span id="latent-text">Delete</span>
        <span id="latent-role" role="img"></span>
        <img id="latent-image" alt="Owner avatar" />
        <span id="latent-css"></span>
      </span>
    </button>
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
  setStyle('thin-line', { display: 'inline', stroke: 'currentColor' });
  setStyle('label', { display: 'inline', fontSize: '13px', fontWeight: '500' });
  setStyle('dead', { display: 'block', fontSize: '13px', fontWeight: '400' });
  setStyle('latent-control', { display: 'flex', width: '28px', height: '28px' });
  setStyle('latent-opacity-wrapper', { display: 'block', opacity: '0' });
  setStyle('latent-icon', { display: 'block', width: '16px', height: '16px' });
  setStyle('latent-icon-path', { display: 'inline', stroke: 'currentColor' });
  setStyle('latent-css', { backgroundImage: 'url("icon.svg")' });
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
  setRect('thin-line', { x: 40.5, y: 30, width: 0, height: 20 });
  setRect('label', { x: 52.5, y: 30, width: 60.5, height: 16 });
  setRect('dead', { x: 20, y: 70, width: 90, height: 20 });
  setRect('latent-control', { x: 200, y: 20, width: 28, height: 28 });
  setRect('latent-opacity-wrapper', { x: 206, y: 26, width: 16, height: 16 });
  setRect('latent-icon', { x: 206, y: 26, width: 16, height: 16 });
  setRect('latent-icon-path', { x: 208, y: 32, width: 12, height: 1 });
  setRect('latent-text', { x: 206, y: 44, width: 40, height: 16 });
  setRect('latent-role', { x: 206, y: 62, width: 16, height: 16 });
  setRect('latent-image', { x: 224, y: 62, width: 16, height: 16 });
  setRect('latent-css', { x: 242, y: 62, width: 16, height: 16 });
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
  const thinLine = element('thin-line');
  const dead = element('dead');
  const latentControl = element('latent-control');
  const latentIcon = element('latent-icon');
  const latentPath = element('latent-icon-path');

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
  assert.equal(thinLine.visible, true, 'one-dimensional SVG strokes remain visible');
  assert.ok(snapshot.coverageInventory.some((item) => item.i === thinLine.i));
  assert.equal(capsule.pseudo.before.content, '"calendar"');

  assert.equal(capsule.behavior.nearestInteractiveAncestor.id, 'capsule');
  assert.equal(capsule.behavior.interactionVerification, 'not-tested');
  assert.equal(capsule.interactionVerification, 'not-tested');
  assert.equal(dead.behavior.hasOnClick, false);
  assert.equal(dead.behavior.nearestInteractiveAncestor, null);
  assert.equal(dead.behavior.interactionVerification, 'not-tested');
  assert.equal(snapshot.meta.interactionVerification, 'not-tested');

  const visible = snapshot.elements.filter((item) => item.visible);
  assert.ok(
    snapshot.coverageInventory.length > visible.length,
    'geometry-bearing opacity-hidden semantic elements must extend visible coverage',
  );
  assert.ok(
    snapshot.coverageInventory.some(
      (item) => item.identity.ownText === 'Properties' && item.categories.text,
    ),
    'ordinary visible text must be inventoried even when it is not an explicit pair',
  );
  const iconInventory = snapshot.coverageInventory.find((item) => item.identity.id === 'calendar');
  assert.equal(iconInventory.categories.svgRoot, true);
  assert.deepEqual(iconInventory.geometry, svg.fractionalBox);
  assert.equal(iconInventory.region.role, 'document');
  assert.equal(iconInventory.interactionStates.hover, 'not-tested');
  assert.equal(latentIcon.visible, false);
  assert.equal(latentIcon.visibility.state, 'opacity-hidden');
  assert.equal(latentIcon.visibility.opacityHiddenBy, element('latent-opacity-wrapper').i);
  assert.equal(latentPath.visibility.state, 'opacity-hidden');
  const latentControlInventory = snapshot.coverageInventory.find(
    (item) => item.i === latentControl.i,
  );
  assert.equal(latentControlInventory.categories.latent, false);
  assert.equal(latentControlInventory.exposure.state, 'visible');
  assert.equal(latentControlInventory.interactionStates.hover, 'potential-hover-not-tested');
  for (const latentElement of [latentIcon, latentPath]) {
    const inventoryItem = snapshot.coverageInventory.find((item) => item.i === latentElement.i);
    assert.ok(inventoryItem, `${latentElement.id} must remain in automatic coverage`);
    assert.equal(inventoryItem.categories.latent, true);
    assert.equal(inventoryItem.exposure.state, 'opacity-hidden');
    assert.equal(inventoryItem.interactionStates.hover, 'potential-hover-not-tested');
  }
  for (const [id, reason] of [
    ['latent-text', 'text'],
    ['latent-role', 'role'],
    ['latent-image', 'alt'],
    ['latent-css', 'background-image'],
  ]) {
    const latentElement = element(id);
    const inventoryItem = snapshot.coverageInventory.find((item) => item.i === latentElement.i);
    assert.ok(inventoryItem, `${id} must remain in automatic latent coverage`);
    assert.equal(inventoryItem.exposure.state, 'opacity-hidden');
    assert.ok(inventoryItem.exposure.semanticReasons.includes(reason));
  }
  const latentIconInventory = snapshot.coverageInventory.find(
    (item) => item.identity.id === 'latent-icon',
  );
  assert.equal(latentIconInventory.identity.ariaLabel, 'No owner');
  assert.equal(latentIconInventory.categories.svgRoot, true);
  assert.equal(snapshot.meta.coverage.scope, 'all-visible-and-opacity-hidden-semantic-elements');
  assert.equal(snapshot.meta.coverage.interactionStateCoverage.hover, 'not-tested');
  assert.equal(
    snapshot.interactionManifest.scope,
    'all-visible-and-opacity-hidden-semantic-interactive-roots',
  );
  assert.equal(snapshot.interactionManifest.complete, false);
  assert.equal(snapshot.interactionManifest.controls.length, 2);
  assert.equal(snapshot.interactionManifest.controls[0].elementIndex, capsule.i);
  assert.equal(snapshot.interactionManifest.controls[0].edges.length, 8);
  assert.ok(
    snapshot.interactionManifest.controls[0].edges.every(
      (edge) => edge.status === 'not-tested' && edge.evidence.length === 0,
    ),
  );
  const latentControlManifest = snapshot.interactionManifest.controls.find(
    (control) => control.elementIndex === latentControl.i,
  );
  assert.equal(latentControlManifest.exposure.state, 'visible');
  assert.equal(latentControlManifest.edges[0].edge, 'hover');
  assert.equal(latentControlManifest.edges[0].status, 'potential-hover-not-tested');
  assert.equal(latentControlManifest.edges[0].evidence.length, 0);
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
