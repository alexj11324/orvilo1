import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { BUILTIN_AGENTS } from '@orvilo/builtin-agents';
import { DEFAULT_AVATAR } from '@orvilo/const';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

// The product ships under the Orvilo mark only: no upstream (lobehub) mascot
// avatars, wordmark components, marketing screenshots, or fluent-emoji
// renderers may survive in shipped source or public assets.
describe('brand assets', () => {
  it('ships no upstream mascot images under public/', () => {
    const avatarsDir = path.join(ROOT, 'public', 'avatars');
    if (existsSync(avatarsDir)) {
      expect(readdirSync(avatarsDir)).toEqual([]);
    }
    expect(existsSync(path.join(ROOT, 'public', 'screenshots'))).toBe(false);
  });

  it('DEFAULT_AVATAR resolves to initials, not a shipped image', () => {
    expect(DEFAULT_AVATAR).toBe('');
  });

  it('builtin agents use emoji or the Orvilo mark, never upstream avatars', () => {
    const PICTOGRAPH = /^\p{Extended_Pictographic}/u;
    for (const [slug, agent] of Object.entries(BUILTIN_AGENTS)) {
      const avatar = agent.avatar;
      if (avatar === undefined) continue;
      const allowed =
        PICTOGRAPH.test(avatar) || avatar.startsWith('/app-icons/') || /^https?:/.test(avatar);
      expect(allowed, `${slug} avatar ${avatar}`).toBe(true);
    }
  });

  it('brand components contain no upstream logo code', () => {
    const files = [
      'src/components/Branding/ProductLogo/index.tsx',
      'src/components/Branding/OrgBrand/index.tsx',
      'src/components/BrandWatermark/index.tsx',
      'src/components/Loading/BrandTextLoading/index.tsx',
      'src/components/ModelSelect/index.tsx',
      'apps/desktop/src/overlay/Avatar.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      expect(source, file).not.toMatch(/ui\/brand|fluent-emoji|LobeHub|LobeChat/);
    }
  });
});
