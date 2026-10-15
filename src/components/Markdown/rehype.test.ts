import { defaultRehypePlugins } from 'streamdown';
import { describe, expect, it } from 'vitest';

import type { MarkdownNode } from './plugins';
import { allowedMarkdownTags, nativeRehypePipeline } from './rehype';

const sanitize = (tree: MarkdownNode, allowedTags: Record<string, string[]>) => {
  const pipeline = nativeRehypePipeline({ allowHtml: false, allowedTags });
  const original = defaultRehypePlugins.sanitize as unknown[];
  const entry = pipeline.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === original[0],
  ) as unknown as [(schema: unknown) => (tree: MarkdownNode) => MarkdownNode, unknown];
  return entry[0](entry[1])(tree);
};

describe('native Markdown domain sanitation', () => {
  it('preserves registered domain identity but strips active attributes and unknown tags', () => {
    const tree: MarkdownNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'mention',
          properties: { id: 'user-1', name: 'Ada', onClick: 'alert(1)', style: 'position:fixed' },
          children: [],
        },
        {
          type: 'element',
          tagName: 'script',
          properties: {},
          children: [{ type: 'text', value: 'alert(1)' }],
        },
        {
          type: 'element',
          tagName: 'a',
          properties: { href: 'javascript:alert(1)' },
          children: [{ type: 'text', value: 'unsafe link' }],
        },
      ],
    };
    const result = sanitize(tree, allowedMarkdownTags(['mention']));
    const mention = result.children!.find((node) => node.tagName === 'mention');
    expect(mention!.properties).toMatchObject({ id: 'user-1', name: 'Ada' });
    expect(JSON.stringify(result)).not.toMatch(/onClick|position:fixed|javascript:|alert\(1\)/);
  });

  it('cannot turn unregistered assistant tags into interactive user markup', () => {
    const tree: MarkdownNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'orviloArtifact',
          properties: { identifier: 'artifact', type: 'text/html' },
          children: [],
        },
        {
          type: 'element',
          tagName: 'skill',
          properties: { name: 'writer', label: 'Write' },
          children: [],
        },
      ],
    };
    const result = sanitize(tree, allowedMarkdownTags(['skill']));
    expect(result.children!.some((node) => node.tagName === 'orviloArtifact')).toBe(false);
    expect(result.children!.find((node) => node.tagName === 'skill')!.properties).toMatchObject({
      name: 'writer',
      label: 'Write',
    });
  });

  it('keeps ordinary raw HTML opt-in independent from custom plugin registration', () => {
    const closed = nativeRehypePipeline({
      allowHtml: false,
      allowedTags: allowedMarkdownTags(['think']),
    });
    const open = nativeRehypePipeline({ allowHtml: true });
    expect(closed).not.toContain(defaultRehypePlugins.raw);
    expect(open).toContain(defaultRehypePlugins.raw);
    expect(closed).toContain(defaultRehypePlugins.harden);
    expect(open).toContain(defaultRehypePlugins.harden);
  });
});
