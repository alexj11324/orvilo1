import { useCallback, useEffect, useRef } from 'react';

/** Wraps a callback so calls arriving after unmount (e.g. a trailing debounce) are dropped. */
export const useWhileMounted = <Args extends unknown[]>(
  callback: (...args: Args) => void,
): ((...args: Args) => void) => {
  const mounted = useRef(true);
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback((...args: Args) => {
    if (mounted.current) latest.current(...args);
  }, []);
};
