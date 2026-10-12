import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Counts how many times this component came back from a hidden `<Activity>`.
 *
 * A hidden Activity tears effects down and runs them again on reveal, while
 * refs and DOM nodes survive. Use the count as a `key` for a child that keeps
 * state on its DOM node and cannot survive that cycle, so it mounts fresh on
 * every reveal. It stays 0 for a component that was never hidden.
 */
export const useRevealEpoch = (): number => {
  const [epoch, setEpoch] = useState(0);
  const shown = useRef(false);

  useLayoutEffect(() => {
    if (shown.current) setEpoch((value) => value + 1);
    shown.current = true;
  }, []);

  return epoch;
};
