/** @vitest-environment happy-dom */
import { render, screen, waitFor } from '@testing-library/react';
import { visit } from 'unist-util-visit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Markdown } from './index';

const mermaidRender = vi.fn();

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { getMermaid: () => ({ render: mermaidRender }) },
}));

vi.mock('@/hooks/useIsDark', () => ({ useIsDark: () => false }));

beforeEach(() => {
  mermaidRender.mockReset();
});

describe('Markdown facade', () => {
  it('renders Markdown elements with element-scoped typography', () => {
    const { container } = render(
      <Markdown variant="chat">{'# Title\n\nSome **bold** text\n\n---\n\n- item'}</Markdown>,
    );

    const root = container.querySelector('article')!;
    expect(root.dataset.markdown).toBe('chat');
    expect(root.style.getPropertyValue('--md-font-size')).toBe('14px');
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('font-bold');
    expect(container.querySelector('hr')!.className).toContain('border-dashed');
    expect(screen.getByText('item').closest('ul')!.className).toContain('list-disc');
  });

  it('does not style elements rendered by embedded components', () => {
    // Mirrors the chat custom-tag plugins: a remark node mapped to a custom element.
    const remarkWidget = () => (tree: any) => {
      visit(tree, 'paragraph', (node: any) => {
        if (node.children?.[0]?.value === 'WIDGET') {
          node.type = 'widgetBlock';
          node.children = [];
          node.data = { hName: 'widget' };
        }
      });
    };
    const Widget = () => (
      <div data-testid="widget">
        <hr data-testid="nested-hr" />
        <p data-testid="nested-p">inside</p>
      </div>
    );

    render(
      <Markdown components={{ widget: Widget }} remarkPlugins={[remarkWidget]}>
        {'Before\n\nWIDGET\n\n---'}
      </Markdown>,
    );

    expect(screen.getByTestId('widget')).toBeTruthy();
    expect(screen.getByTestId('nested-hr').getAttribute('class')).toBeNull();
    expect(screen.getByTestId('nested-p').getAttribute('class')).toBeNull();
  });

  it('renders fenced code through the local code block', () => {
    const { container } = render(<Markdown>{'```ts\nconst a = 1;\n```'}</Markdown>);

    expect(container.querySelector('[data-slot="code-block"]')).toBeTruthy();
    expect(container.textContent).toContain('const a = 1;');
  });

  it('honours a pre override', () => {
    const Pre = () => <div data-testid="custom-pre" />;
    render(<Markdown components={{ pre: Pre }}>{'```\nx\n```'}</Markdown>);

    expect(screen.getByTestId('custom-pre')).toBeTruthy();
  });

  it('renders mermaid fences as diagrams', async () => {
    mermaidRender.mockResolvedValue({ svg: '<svg data-testid="diagram"></svg>' });
    const { container } = render(<Markdown>{'```mermaid\ngraph TD; A-->B\n```'}</Markdown>);

    await waitFor(() => expect(container.querySelector('[data-slot="mermaid"] svg')).toBeTruthy());
    expect(mermaidRender).toHaveBeenCalledWith(expect.any(String), 'graph TD; A-->B');
  });

  it('falls back to the mermaid source when rendering fails', async () => {
    mermaidRender.mockRejectedValue(new Error('Parse error on line 1'));
    const { container } = render(<Markdown>{'```mermaid\nnot a diagram\n```'}</Markdown>);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Parse error on line 1'),
    );
    expect(container.querySelector('[data-slot="mermaid"]')).toBeNull();
    expect(container.textContent).toContain('not a diagram');
  });

  it('keeps raw HTML as text unless allowHtml is set', () => {
    const text = render(<Markdown>{'<b>raw</b>'}</Markdown>);
    expect(text.container.querySelector('b')).toBeNull();
    expect(text.container.textContent).toContain('<b>raw</b>');

    const html = render(<Markdown allowHtml>{'<b>raw</b>'}</Markdown>);
    expect(html.container.querySelector('b')?.textContent).toBe('raw');
  });

  it('resolves numbered citations to their sources', () => {
    render(
      <Markdown enableCustomFootnotes citations={[{ title: 'Source', url: 'https://example.com' }]}>
        {'Claim [1].'}
      </Markdown>,
    );

    const link = screen.getByTitle('Source');
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.textContent).toBe('1');
  });

  it('passes the rendered tree through customRender', () => {
    render(
      <Markdown
        customRender={(dom, { text }) => (
          <div data-testid="wrap" data-text={text}>
            {dom}
          </div>
        )}
      >
        {'hello'}
      </Markdown>,
    );

    expect(screen.getByTestId('wrap').dataset.text).toBe('hello');
    expect(screen.getByTestId('wrap').textContent).toContain('hello');
  });
});
