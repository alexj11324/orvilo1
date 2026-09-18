import { describe, expect, it } from 'vitest';

import rehypePlugin from './rehypePlugin';

describe('rehypePlugin', () => {
  it('should transform <orviloArtifact> tags with attributes', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [
            {
              type: 'raw',
              value:
                '<orviloArtifact identifier="test-id" type="image/svg+xml" title="Test Title">',
            },
            { type: 'text', value: 'Artifact content' },
            { type: 'raw', value: '</orviloArtifact>' },
          ],
        },
      ],
    };

    const expectedTree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'orviloArtifact',
          properties: {
            identifier: 'test-id',
            type: 'image/svg+xml',
            title: 'Test Title',
          },
          children: [{ type: 'text', value: 'Artifact content' }],
        },
      ],
    };

    const plugin = rehypePlugin();
    plugin(tree);

    expect(tree).toEqual(expectedTree);
  });

  it('should handle mixed content with thinking tags and plain text', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [{ type: 'text', value: 'Initial plain text paragraph' }],
        },
        {
          type: 'element',
          tagName: 'p',
          children: [
            { type: 'raw', value: '<orviloThinking>' },
            { type: 'text', value: 'AI is thinking...' },
            { type: 'raw', value: '</orviloThinking>' },
          ],
        },
        {
          type: 'element',
          tagName: 'p',
          children: [
            {
              type: 'raw',
              value:
                '<orviloArtifact identifier="test-id" type="image/svg+xml" title="Test Title">',
            },
            { type: 'text', value: 'Artifact content' },
            { type: 'raw', value: '</orviloArtifact>' },
          ],
        },
        {
          type: 'element',
          tagName: 'p',
          children: [{ type: 'text', value: 'Final plain text paragraph' }],
        },
      ],
    };

    const expectedTree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [{ type: 'text', value: 'Initial plain text paragraph' }],
        },
        {
          type: 'element',
          tagName: 'p',
          children: [
            { type: 'raw', value: '<orviloThinking>' },
            { type: 'text', value: 'AI is thinking...' },
            { type: 'raw', value: '</orviloThinking>' },
          ],
        },
        {
          type: 'element',
          tagName: 'orviloArtifact',
          properties: {
            identifier: 'test-id',
            type: 'image/svg+xml',
            title: 'Test Title',
          },
          children: [{ type: 'text', value: 'Artifact content' }],
        },
        {
          type: 'element',
          tagName: 'p',
          children: [{ type: 'text', value: 'Final plain text paragraph' }],
        },
      ],
    };

    const plugin = rehypePlugin();
    plugin(tree);

    expect(tree).toEqual(expectedTree);
  });

  it('should transform multiple <orviloArtifact> tags in the same tree', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [{ type: 'text', value: 'Here are two artifacts:' }],
        },
        {
          type: 'element',
          tagName: 'p',
          children: [
            {
              type: 'raw',
              value:
                '<orviloArtifact identifier="first" type="text/markdown" title="First Artifact">',
            },
            { type: 'text', value: 'First content' },
            { type: 'raw', value: '</orviloArtifact>' },
          ],
        },
        {
          type: 'element',
          tagName: 'p',
          children: [
            {
              type: 'raw',
              value:
                '<orviloArtifact identifier="second" type="text/markdown" title="Second Artifact">',
            },
            { type: 'text', value: 'Second content' },
            { type: 'raw', value: '</orviloArtifact>' },
          ],
        },
        {
          type: 'element',
          tagName: 'p',
          children: [{ type: 'text', value: 'Done.' }],
        },
      ],
    };

    const plugin = rehypePlugin();
    plugin(tree);

    // Both artifacts should be transformed
    expect(tree.children).toHaveLength(4);
    expect(tree.children[1]).toEqual({
      type: 'element',
      tagName: 'orviloArtifact',
      properties: {
        identifier: 'first',
        type: 'text/markdown',
        title: 'First Artifact',
      },
      children: [{ type: 'text', value: 'First content' }],
    });
    expect(tree.children[2]).toEqual({
      type: 'element',
      tagName: 'orviloArtifact',
      properties: {
        identifier: 'second',
        type: 'text/markdown',
        title: 'Second Artifact',
      },
      children: [{ type: 'text', value: 'Second content' }],
    });
  });

  it('should transform multiple raw <orviloArtifact> nodes (without wrapping <p>)', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'raw',
          value: '<orviloArtifact identifier="raw-1" type="text/html" title="Raw First">',
        },
        {
          type: 'raw',
          value: '<orviloArtifact identifier="raw-2" type="text/html" title="Raw Second">',
        },
      ],
    };

    const plugin = rehypePlugin();
    plugin(tree);

    expect(tree.children).toHaveLength(2);
    expect((tree.children[0] as any).tagName).toBe('orviloArtifact');
    expect((tree.children[1] as any).tagName).toBe('orviloArtifact');
  });
});
