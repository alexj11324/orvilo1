import { describe, expect, it } from 'vitest';

import { animatedEmojiUrl } from './animatedEmojiUrl';

describe('animated emoji artwork routing', () => {
  it('keeps existing groups and complete multi-codepoint identity', () => {
    expect(animatedEmojiUrl('📦')).toContain('anim-2/latest/files/assets/1f4e6.webp');
    expect(animatedEmojiUrl('😀')).toContain('anim-2/latest/files/assets/1f600.webp');
    expect(animatedEmojiUrl('🧑‍💻')).toContain('anim-4/latest/files/assets/1f9d1-200d-1f4bb.webp');
  });
});
