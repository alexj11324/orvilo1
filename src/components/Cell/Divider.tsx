'use client';

import { memo } from 'react';

import { useIsDark } from '@/hooks/useIsDark';

const styles = {
  dividerDark:
    'flex-none w-full h-1.5 [background:initial] supports-[background:color-mix(in_srgb,black,transparent)]:[background:color-mix(in_srgb,var(--accent)_4%,transparent)]',
  dividerLight: 'flex-none w-full h-1.5 [background:var(--accent)]',
};

const Divider = memo(() => {
  const isDarkMode = useIsDark();

  return <div className={isDarkMode ? styles.dividerDark : styles.dividerLight} />;
});

export default Divider;
