/**
 * Whether an expiry submitted from the date editor changes nothing — or cannot
 * be applied at all. The editor hands back a string while the key stores a
 * `Date`, so a `===` between them is never true and every blur re-saved the
 * key; an unparsable value must not be sent as an Invalid Date either.
 */
export const isExpiryUnchanged = (
  next: unknown,
  current: Date | string | null | undefined,
): boolean => {
  const nextTime = next ? new Date(next as string | number | Date).getTime() : null;
  if (Number.isNaN(nextTime)) return true;

  const currentTime = current ? new Date(current).getTime() : null;

  return nextTime === currentTime;
};
