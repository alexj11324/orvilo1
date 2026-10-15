import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderDiagram } from './render';

const engine = vi.hoisted(() => ({ render: vi.fn(), getMermaid: vi.fn() }));
vi.mock('@streamdown/mermaid', () => ({
  createMermaidPlugin: () => ({ getMermaid: engine.getMermaid }),
}));

beforeEach(() => {
  engine.render.mockReset();
  engine.getMermaid.mockReset().mockReturnValue({ render: engine.render });
});

describe('native diagram render scheduling', () => {
  it('does not change global renderer theme until the preceding render settles', async () => {
    let finish!: (result: { svg: string }) => void;
    engine.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    engine.render.mockResolvedValueOnce({ svg: '<svg id="second" />' });
    const first = renderDiagram('first', 'graph A', { theme: 'dark' });
    const second = renderDiagram('second', 'graph B', { theme: 'default' });
    await Promise.resolve();
    expect(engine.getMermaid).toHaveBeenCalledTimes(1);
    finish({ svg: '<svg id="first" />' });
    expect(await first).toContain('first');
    expect(await second).toContain('second');
    expect(engine.getMermaid).toHaveBeenCalledTimes(2);
  });

  it('a malformed diagram does not block later valid renders', async () => {
    engine.render.mockRejectedValueOnce(new Error('Invalid syntax'));
    engine.render.mockResolvedValueOnce({ svg: '<svg />' });
    await expect(renderDiagram('bad', 'invalid', {})).rejects.toThrow('Invalid syntax');
    await expect(renderDiagram('good', 'graph A', {})).resolves.toBe('<svg />');
  });

  it('skips a cancelled stream update before touching the shared engine', async () => {
    const cancellation = new AbortController();
    cancellation.abort();
    await expect(
      renderDiagram('obsolete', 'graph A', {}, cancellation.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(engine.getMermaid).not.toHaveBeenCalled();
  });

  it('untrusted callers cannot enable scripts or automatic document scanning', async () => {
    engine.render.mockResolvedValueOnce({ svg: '<svg />' });
    await renderDiagram('safe', 'graph A', {
      securityLevel: 'loose',
      startOnLoad: true,
      suppressErrorRendering: false,
    });
    expect(engine.getMermaid).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        startOnLoad: false,
        suppressErrorRendering: true,
      }),
    );
  });
});
