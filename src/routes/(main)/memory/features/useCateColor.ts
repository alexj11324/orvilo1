import { useMemo } from 'react';

function getStableRandom(str: string, min = 0, max = 100) {
  if (min > max) {
    return 0;
  }

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  hash = Math.abs(hash);
  const range = max - min + 1;
  return min + (hash % range);
}

export const useCateColor = (cate?: string | null) =>
  useMemo(() => {
    if (!cate) return undefined;
    const index = getStableRandom(cate, 0, 9);
    return {
      backgroundColor: `var(--memory-category-${index}-background)`,
      backgroundTextColor: `var(--memory-category-${index}-background-text)`,
      color: `var(--memory-category-${index}-text)`,
      shadowColor: `var(--memory-category-${index}-shadow)`,
    };
  }, [cate]);
