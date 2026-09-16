import { describe, expect, it } from 'vitest';

import ProfileSkeleton from '@/components/Skeleton/Profile';
import { routeMeta } from '@/spa/router/routeMeta';

import { resolveRouteSkeleton } from './useRouteSkeleton';

describe('resolveRouteSkeleton', () => {
  it('returns the deepest match that declares a skeleton', () => {
    const Skeleton = resolveRouteSkeleton([
      { handle: { meta: routeMeta({ titleKey: 'navigation.chat' }) } },
      {
        handle: { meta: routeMeta({ Skeleton: ProfileSkeleton, titleKey: 'navigation.profile' }) },
      },
    ]);

    expect(Skeleton).toBe(ProfileSkeleton);
  });

  it('skips matches without a skeleton and uses the nearest ancestor', () => {
    const Skeleton = resolveRouteSkeleton([
      {
        handle: { meta: routeMeta({ Skeleton: ProfileSkeleton, titleKey: 'navigation.profile' }) },
      },
      { handle: { meta: routeMeta({ titleKey: 'navigation.permission' }) } },
    ]);

    expect(Skeleton).toBe(ProfileSkeleton);
  });

  it('returns undefined when no match declares a skeleton', () => {
    expect(
      resolveRouteSkeleton([{ handle: { meta: routeMeta({ titleKey: 'navigation.chat' }) } }]),
    ).toBeUndefined();
  });
});
