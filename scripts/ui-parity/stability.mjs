// Both sides must establish a quiet baseline independently; no product-specific expectations.
export function createStabilityWindow(duration = 1500) {
  let previous;
  let since;
  return (value, ready, now) => {
    if (!ready) {
      previous = undefined;
      since = undefined;
      return false;
    }
    const signature = JSON.stringify(value);
    if (signature !== previous) {
      previous = signature;
      since = now;
    }
    return now - since >= duration;
  };
}
