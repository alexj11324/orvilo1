import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { createNativeBrowserEditor } from '@/components/NativePageEditor/session';

import { readNativeCommentValue } from './nativeCommentValue';

function createCommentKernel() {
  const kernel = createNativeBrowserEditor(
    () => ({
      code: () => null,
      math: () => null,
      mention: () => null,
      linkCard: () => null,
      linkIframe: () => null,
      linkSchema: () => null,
    }),
    () => ({
      decorator: () => createElement('span'),
      handleUpload: async () => ({ url: '/file' }),
      theme: {},
    }),
    () => ({
      defaultBlockImage: true,
      getImageWidth: async () => 100,
      handleUpload: async () => ({ url: '/image' }),
      handleRehost: async (url: string) => ({ url }),
      needRehost: () => false,
      render: () => createElement('span'),
    }),
  );
  kernel.initNodeEditor();
  return kernel;
}
describe('actual native comment persistence codec', () => {
  it('round trips rich text and unicode emoji through actual JSON and Markdown datasources', () => {
    const kernel = createCommentKernel();
    try {
      kernel.setDocument('markdown', '**A rich comment** 中文 👩🏽‍💻\n\n- first\n- second');
      const first = readNativeCommentValue(kernel);
      expect(first.content).toContain('**A rich comment**');
      expect(first.content).toContain('中文 👩🏽‍💻');
      kernel.cleanDocument();
      kernel.setDocument('json', JSON.stringify(first.editorData), { keepId: true });
      expect(readNativeCommentValue(kernel)).toEqual(first);
    } finally {
      kernel.destroy();
    }
  });
  it('preserves actual rich links through the persistence boundary', () => {
    const kernel = createCommentKernel();
    try {
      kernel.setDocument('markdown', '[reference](https://example.com/file)');
      const value = readNativeCommentValue(kernel);
      expect(value.content).toContain('https://example.com/file');
      expect(JSON.stringify(value.editorData)).toContain('https://example.com/file');
    } finally {
      kernel.destroy();
    }
  });
});

describe('actual published read-only rich snapshots', () => {
  it('hydrates persisted rich JSON while preserving readonly selection/copy data', () => {
    const kernel = createCommentKernel();
    try {
      kernel.setDocument(
        'markdown',
        '**Published** 中文 👩🏽‍💻\n\n| A | B |\n| --- | --- |\n| C | D |',
      );
      const published = readNativeCommentValue(kernel);
      kernel.cleanDocument();
      kernel.setEditable(false);
      kernel.setDocument('json', JSON.stringify(published.editorData), { keepId: true });
      expect(kernel.getLexicalEditor()?.isEditable()).toBe(false);
      expect(readNativeCommentValue(kernel)).toEqual(published);
      expect(JSON.stringify(published.editorData)).toContain('table');
    } finally {
      kernel.destroy();
    }
  });
  it('accepts a newer server rich snapshot without granting edit permission', () => {
    const kernel = createCommentKernel();
    try {
      kernel.setEditable(false);
      kernel.setDocument('markdown', 'old published comment');
      kernel.setDocument(
        'markdown',
        '**Updated by author** [attachment](https://example.com/file)',
      );
      const updated = readNativeCommentValue(kernel);
      expect(updated.content).toContain('**Updated by author**');
      expect(updated.content).not.toContain('old published comment');
      expect(updated.content).toContain('https://example.com/file');
      expect(kernel.getLexicalEditor()?.isEditable()).toBe(false);
    } finally {
      kernel.destroy();
    }
  });
});
