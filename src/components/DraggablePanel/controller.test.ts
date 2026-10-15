import { describe, expect, it, vi } from 'vitest';

import { createPanelController, type PanelOptions } from './controller';

const setup = (overrides: Partial<PanelOptions> = {}) => {
  const options: PanelOptions = {
    defaultSize: 280,
    expand: true,
    max: 600,
    min: 200,
    onExpandChange: vi.fn(),
    onSizeChange: vi.fn(),
    onSizeDragging: vi.fn(),
    placement: 'right',
    size: 300,
    ...overrides,
  };
  return { controller: createPanelController(options), options };
};

const key = (k: string, shiftKey = false) => ({ key: k, preventDefault: vi.fn(), shiftKey });

describe('createPanelController drag', () => {
  it('grows a right panel when the seam moves left and commits on release', () => {
    const { controller, options } = setup();

    controller.drag.start();
    expect(controller.state.dragging).toBe(true);
    controller.drag.move({ x: -50, y: 0 });
    expect(controller.motion.size.get()).toBe(350);
    expect(options.onSizeDragging).toHaveBeenLastCalledWith(350, 50);

    controller.drag.end();
    expect(controller.state.dragging).toBe(false);
    expect(options.onSizeChange).toHaveBeenCalledWith(350, 50);
  });

  it('grows a left panel when the seam moves right and clamps to min and max', () => {
    const { controller, options } = setup({ placement: 'left' });

    controller.drag.start();
    controller.drag.move({ x: 1000, y: 0 });
    expect(controller.motion.size.get()).toBe(600);
    controller.drag.move({ x: -1000, y: 0 });
    expect(controller.motion.size.get()).toBe(200);
    controller.drag.end();
    expect(options.onSizeChange).toHaveBeenCalledWith(200, -100);
  });

  it('uses the vertical axis for a bottom panel', () => {
    const { controller } = setup({ max: 720, min: 160, placement: 'bottom', size: 240 });

    controller.drag.start();
    controller.drag.move({ x: 500, y: -60 });
    expect(controller.motion.size.get()).toBe(300);
  });

  it('previews a collapse below the threshold and collapses on release', () => {
    const { controller, options } = setup({ collapseThreshold: 120, min: 0 });

    controller.drag.start();
    controller.drag.move({ x: 250, y: 0 });
    expect(controller.state.collapsing).toBe(true);
    expect(controller.motion.size.get()).toBe(0);
    // The reported size stays at the start until the collapse is committed.
    expect(options.onSizeDragging).toHaveBeenLastCalledWith(300, 0);

    controller.drag.end();
    expect(options.onExpandChange).toHaveBeenCalledWith(false);
    expect(options.onSizeChange).toHaveBeenCalledWith(300, 0);
    expect(controller.motion.content.get()).toBe(300);
  });

  it('restores the start size on cancel without committing', () => {
    const { controller, options } = setup();

    controller.drag.start();
    controller.drag.move({ x: -80, y: 0 });
    controller.drag.cancel();
    expect(controller.motion.size.get()).toBe(300);
    expect(controller.state.dragging).toBe(false);
    expect(options.onSizeChange).not.toHaveBeenCalled();
  });

  it('ignores moves outside a drag', () => {
    const { controller, options } = setup();

    controller.drag.move({ x: -80, y: 0 });
    controller.drag.end();
    expect(controller.motion.size.get()).toBe(300);
    expect(options.onSizeChange).not.toHaveBeenCalled();
  });
});

describe('createPanelController keyboard and reset', () => {
  it('resizes along the panel axis and clamps to the bounds', () => {
    const { controller, options } = setup();

    const left = key('ArrowLeft');
    controller.resizeByKey(left);
    expect(left.preventDefault).toHaveBeenCalled();
    expect(options.onSizeChange).toHaveBeenLastCalledWith(310, 10);

    controller.resizeByKey(key('ArrowRight', true));
    expect(options.onSizeChange).toHaveBeenLastCalledWith(250, -50);

    controller.resizeByKey(key('Home'));
    expect(options.onSizeChange).toHaveBeenLastCalledWith(200, -100);
    controller.resizeByKey(key('End'));
    expect(options.onSizeChange).toHaveBeenLastCalledWith(600, 300);

    const vertical = key('ArrowUp');
    controller.resizeByKey(vertical);
    expect(vertical.preventDefault).not.toHaveBeenCalled();
  });

  it('toggles expansion with Enter and Space', () => {
    const { controller, options } = setup();

    controller.resizeByKey(key('Enter'));
    expect(options.onExpandChange).toHaveBeenCalledWith(false);
  });

  it('reset restores the default size and expands a collapsed panel', () => {
    const { controller, options } = setup({ expand: false });

    controller.reset();
    expect(options.onExpandChange).toHaveBeenCalledWith(true);
    expect(options.onSizeChange).toHaveBeenCalledWith(280, 280);
  });
});

describe('createPanelController sync', () => {
  it('targets zero while collapsed and the size again when expanded', () => {
    const { controller, options } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.sync({ ...options, expand: false });
    expect(controller.target).toBe(0);
    expect(controller.state.folding).toBe(true);
    expect(listener).toHaveBeenCalled();

    controller.sync({ ...options, expand: true, size: 420 });
    expect(controller.target).toBe(420);
  });

  it('settles immediately when the size already matches', () => {
    const { controller, options } = setup();

    controller.sync({ ...options, size: 300 });
    expect(controller.state.folding).toBe(false);
    expect(controller.target).toBe(300);
  });
});
