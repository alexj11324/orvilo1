import { act, cleanup, render } from '@testing-library/react';
import { VirtuosoMasonry } from '@virtuoso.dev/masonry';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mount the installed, patched dependency. Do not mock its measurement model.
describe('VirtuosoMasonry observer delivery', () => {
  type MockObserver = { callback: ResizeObserverCallback; targets: Set<Element> };
  let owners: Map<Element, MockObserver>;
  let observe: ReturnType<typeof vi.fn<(target: Element, options?: ResizeObserverOptions) => void>>;
  let unobserve: ReturnType<typeof vi.fn<(target: Element) => void>>;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  beforeEach(() => {
    owners = new Map();
    frames = new Map();
    nextFrame = 0;
    observe = vi.fn<(target: Element, options?: ResizeObserverOptions) => void>();
    unobserve = vi.fn<(target: Element) => void>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        callback: ResizeObserverCallback;
        targets = new Set<Element>();
        constructor(cb: ResizeObserverCallback) {
          this.callback = cb;
        }
        observe(target: Element, options?: ResizeObserverOptions) {
          this.targets.add(target);
          owners.set(target, this);
          observe(target, options);
        }
        unobserve(target: Element) {
          this.targets.delete(target);
          // Keep historical ownership to exercise a late queued delivery.
          unobserve(target);
        }
        disconnect() {
          this.targets.clear();
        }
      },
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        frames.set(++nextFrame, cb);
        return nextFrame;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => frames.delete(id)),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const deliver = (target: Element, height: number) =>
    act(() => {
      const owner = owners.get(target);
      if (!owner) throw new Error('No ResizeObserver owns this target');
      owner.callback(
        [{ target, contentRect: { height, width: 400, top: 0 } } as ResizeObserverEntry],
        owner as unknown as ResizeObserver,
      );
    });
  const flushFrame = () =>
    act(() => {
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((cb) => cb(0));
    });
  const TestItem = ({ data }: { data: number }) => <div>{data}</div>;
  const mount = (strict = false) => {
    const masonry = (
      <VirtuosoMasonry
        ItemContent={({ data }) => <div>{data}</div>}
        columnCount={2}
        data={[1, 2]}
      />
    );
    const result = render(strict ? <StrictMode>{masonry}</StrictMode> : masonry);
    const scroller = result.getByTestId('virtuoso-scroller');
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 500 },
    });
    deliver(scroller, 500);
    flushFrame();
    return {
      ...result,
      columns: result.getAllByTestId('virtuoso-list'),
      items: Array.from(result.container.querySelectorAll('[data-index]')),
      scroller,
    };
  };

  it('updates ancestor heights after the frame, never inside observer delivery', () => {
    const { items, columns } = mount();
    expect(columns[0].style.height).toBe('0px');
    deliver(items[0], 100);
    expect(columns[0].style.height).toBe('0px'); // FAILS on original 1.4.3.
    expect(frames.size).toBe(1);
    flushFrame();
    expect(columns[0].style.height).toBe('100px');
  });

  it('coalesces the latest measurement of each target across separate deliveries', () => {
    const { items, columns } = mount();
    deliver(items[0], 100);
    deliver(items[1], 240);
    deliver(items[0], 120);
    expect(frames.size).toBe(1);
    flushFrame();
    expect(columns.map((column) => column.style.height)).toEqual(['120px', '240px']);
  });

  it('forwards native observation options and removes pending targets on unmount', () => {
    const { items, columns, scroller, unmount } = mount();
    expect(observe).toHaveBeenCalledWith(scroller, { box: 'border-box' });
    expect(observe).toHaveBeenCalledWith(columns[0], { box: 'border-box' });
    expect(observe).toHaveBeenCalledWith(items[0], undefined);
    deliver(items[0], 100);
    unmount();
    expect(unobserve).toHaveBeenCalledWith(items[0]);
    expect(frames.size).toBe(0);
    deliver(items[0], 200); // An already queued notification cannot revive removed targets.
    expect(frames.size).toBe(0);
  });

  it('continues measuring after StrictMode effect cleanup and setup', () => {
    const { items, columns } = mount(true);
    deliver(items[0], 100);
    flushFrame();
    expect(columns[0].style.height).toBe('100px');
  });

  it('owns the footer inside its scroller without forwarding it as a DOM attribute', () => {
    const { getByTestId, getByText, container } = render(
      <VirtuosoMasonry<number, undefined>
        ItemContent={TestItem}
        columnCount={2}
        data={[1, 2]}
        footer={<div>Loading...</div>}
      />,
    );
    const scroller = getByTestId('virtuoso-scroller');
    expect(scroller.contains(getByText('Loading...'))).toBe(true);
    expect(scroller.hasAttribute('footer')).toBe(false);
    expect(container.querySelectorAll('[data-testid="virtuoso-list"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-index]')).toHaveLength(2);
  });

  it('adds and removes the footer without remounting columns or real item content', () => {
    const data = [1, 2];
    const masonry = (footer: ReactNode) => (
      <VirtuosoMasonry<number, undefined>
        ItemContent={TestItem}
        columnCount={2}
        data={data}
        footer={footer}
      />
    );
    const result = render(masonry(null));
    const scroller = result.getByTestId('virtuoso-scroller');
    const columns = result.getAllByTestId('virtuoso-list');
    const items = Array.from(result.container.querySelectorAll('[data-index]'));
    const contents = items.map((item) => item.firstElementChild);
    expect(items).toHaveLength(2);
    const expectOriginalNodes = () => {
      expect(result.getByTestId('virtuoso-scroller')).toBe(scroller);
      result.getAllByTestId('virtuoso-list').forEach((column, index) => {
        expect(column).toBe(columns[index]);
      });
      const currentItems = Array.from(result.container.querySelectorAll('[data-index]'));
      expect(currentItems).toHaveLength(items.length);
      currentItems.forEach((item, index) => {
        expect(item).toBe(items[index]);
        expect(item.firstElementChild).toBe(contents[index]);
      });
    };
    result.rerender(masonry(<div>Loading...</div>));
    expect(scroller.contains(result.getByText('Loading...'))).toBe(true);
    expectOriginalNodes();
    result.rerender(masonry(null));
    expect(result.queryByText('Loading...')).toBeNull();
    expectOriginalNodes();
  });
});
