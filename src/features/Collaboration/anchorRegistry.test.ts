import { afterEach, describe, expect, it } from 'vitest';

import { AnchorRegistry } from './anchorRegistry';
import { COLLAB_ID_ATTR } from './anchors';

const flushObserver = async () => {
  // MutationObserver delivery is async — give it a microtask + a task turn.
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

describe('AnchorRegistry', () => {
  let detach: (() => void) | undefined;

  afterEach(() => {
    detach?.();
    detach = undefined;
    document.body.innerHTML = '';
  });

  it('bumps version when the anchor set changes', async () => {
    const registry = new AnchorRegistry();
    detach = registry.attach(document);
    const before = registry.version;

    const el = document.createElement('div');
    el.setAttribute(COLLAB_ID_ATTR, 'task:t-1');
    document.body.append(el);
    await flushObserver();

    expect(registry.version).toBeGreaterThan(before);
    expect(registry.has('task:t-1')).toBe(true);
  });

  it('bumps version when a nested scroller scrolls — scroll does not bubble', async () => {
    const registry = new AnchorRegistry();
    detach = registry.attach(document);

    const scroller = document.createElement('div');
    const inner = document.createElement('div');
    scroller.append(inner);
    document.body.append(scroller);
    await flushObserver();
    const before = registry.version;

    // Real scroll events do not bubble; the registry must rely on the window's
    // capture phase to see scrolls inside nested containers.
    inner.dispatchEvent(new Event('scroll'));
    await nextFrame();

    expect(registry.version).toBe(before + 1);
  });

  it('bumps version on window resize', async () => {
    const registry = new AnchorRegistry();
    detach = registry.attach(document);
    const before = registry.version;

    window.dispatchEvent(new Event('resize'));
    await nextFrame();

    expect(registry.version).toBe(before + 1);
  });

  it('coalesces a scroll burst into a single bump per frame', async () => {
    const registry = new AnchorRegistry();
    detach = registry.attach(document);
    const before = registry.version;

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();

    expect(registry.version).toBe(before + 1);

    window.dispatchEvent(new Event('scroll'));
    await nextFrame();

    expect(registry.version).toBe(before + 2);
  });

  it('stops bumping once detached', async () => {
    const registry = new AnchorRegistry();
    const detachNow = registry.attach(document);
    detachNow();
    detach = undefined;
    const before = registry.version;

    window.dispatchEvent(new Event('scroll'));
    await nextFrame();

    expect(registry.version).toBe(before);
  });
});
