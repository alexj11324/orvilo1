import { createEditor } from 'lexical';
import { describe, expect, it } from 'vitest';

import { createNativeDecoratorRegistry } from './nativeDecoratorRegistry';

describe('native embed decorator registry', () => {
  it('isolates node kinds and actual editors', () => {
    const files = createNativeDecoratorRegistry<string>();
    const topics = createNativeDecoratorRegistry<string>();
    const first = createEditor();
    const second = createEditor();
    const releaseFile = files.register(first, (value) => `file:${value}`);
    const releaseTopic = topics.register(first, (value) => `topic:${value}`);
    const releaseSecond = files.register(second, (value) => `other:${value}`);
    expect(files.render(first, 'A')).toBe('file:A');
    expect(topics.render(first, 'A')).toBe('topic:A');
    expect(files.render(second, 'A')).toBe('other:A');
    releaseFile();
    releaseFile();
    expect(files.render(first, 'A')).toBeNull();
    expect(topics.render(first, 'A')).toBe('topic:A');
    releaseTopic();
    releaseSecond();
  });
  it('preserves latest owner and handles cleanup in either order', () => {
    const registry = createNativeDecoratorRegistry<string>();
    const editor = createEditor();
    const first = registry.register(editor, () => 'first');
    const second = registry.register(editor, () => 'second');
    first();
    expect(registry.render(editor, '')).toBe('second');
    second();
    expect(registry.render(editor, '')).toBeNull();
    const restoreFirst = registry.register(editor, () => 'first');
    const restoreSecond = registry.register(editor, () => 'second');
    restoreSecond();
    expect(registry.render(editor, '')).toBe('first');
    restoreFirst();
    expect(registry.render(editor, '')).toBeNull();
  });
});
