import { describe, expect, it } from 'vitest';

import {
  type MarkdownNode,
  rehypeFootnoteDetails,
  remarkChatBreaks,
  remarkCitations,
  remarkFootnoteDetails,
  remarkGithubAlerts,
} from './plugins';

const text = (value: string): MarkdownNode => ({ type: 'text', value });

describe('native Markdown semantic plugins', () => {
  it('resolves bounded citations in prose while leaving code, math and existing links intact', () => {
    const link = { type: 'link', url: '/task/example', children: [text('[1]')] };
    const code = { type: 'inlineCode', value: '[1]' };
    const math = { type: 'inlineMath', value: '[1]' };
    const tree: MarkdownNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [text('See [1], [10], [11].'), link, code, math] }],
    };
    remarkCitations({ count: 10 })(tree);
    const children = tree.children![0].children!;
    expect(children.filter((node) => node.type === 'link').map((node) => node.url)).toEqual([
      'citation-1',
      'citation-10',
      '/task/example',
    ]);
    expect(children.some((node) => node.value?.includes('[11]'))).toBe(true);
    expect(link.children[0].value).toBe('[1]');
    expect(code.value).toBe('[1]');
    expect(math.value).toBe('[1]');
  });

  it('preserves multi-digit footnote identifiers and ordinary non-link definitions', () => {
    const file = { data: {} as Record<string, unknown> };
    const tree: MarkdownNode = {
      type: 'root',
      children: [
        {
          type: 'footnoteDefinition',
          identifier: '10',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'link', url: 'https://example.com/10', children: [text('Source ten')] },
              ],
            },
          ],
        },
        {
          type: 'footnoteDefinition',
          identifier: '11',
          children: [{ type: 'paragraph', children: [text('Plain note')] }],
        },
      ],
    };
    remarkFootnoteDetails()(tree, file);
    const rendered: MarkdownNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'a',
          properties: { href: '#user-content-fn-10', dataFootnoteRef: true },
        },
      ],
    };
    rehypeFootnoteDetails()(rendered, file);
    expect(JSON.parse(String(rendered.children![0].properties!.dataCitationDetail))).toEqual({
      url: 'https://example.com/10',
      title: 'Source ten',
    });
    expect(file.data.nativeFootnoteDetails).not.toHaveProperty('11');
  });

  it('preserves empty chat lines and converts only safe br tags without modifying code', () => {
    const tree: MarkdownNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            text('first\n\nlast'),
            { type: 'html', value: '<br />' },
            { type: 'html', value: '<script>alert(1)</script>' },
            { type: 'inlineCode', value: 'a\nb' },
          ],
        },
      ],
    };
    remarkChatBreaks()(tree);
    const nodes = tree.children![0].children!;
    expect(nodes.filter((node) => node.type === 'break')).toHaveLength(3);
    expect(nodes.find((node) => node.type === 'html')!.value).toContain('<script>');
    expect(nodes.find((node) => node.type === 'inlineCode')!.value).toBe('a\nb');
  });
  it('recognizes GFM alert markers only in parsed blockquotes and preserves their body', () => {
    const tree: MarkdownNode = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            { type: 'paragraph', children: [text('[!WARNING]\nCheck the configuration')] },
          ],
        },
        { type: 'code', value: '[!WARNING]\nKeep this exact' },
      ],
    };
    remarkGithubAlerts()(tree);
    expect(tree.children![0].data).toEqual({
      hName: 'aside',
      hProperties: { dataAlert: 'WARNING' },
    });
    expect(tree.children![0].children![0].children![0].value).toBe('Check the configuration');
    expect(tree.children![1].value).toBe('[!WARNING]\nKeep this exact');
  });
});
