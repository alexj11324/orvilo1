// Self-contained functions are also serialized into the inspected renderer.
export function selectTargets(matches) {
  const interactive = matches.filter((element) =>
    element.matches(
      'button,a[href],input,textarea,select,[role="button"],[role="tab"],[role="option"],[role="menuitem"],[role="checkbox"],[role="radio"]',
    ),
  );
  const candidates = interactive.length ? interactive : matches;
  return candidates.filter(
    (element) => !candidates.some((other) => other !== element && element.contains(other)),
  );
}

export function isPendingIndicator(element) {
  if (element.getAttribute('aria-busy') === 'true') return true;
  // A determinate progress widget represents data, not necessarily pending work.
  // Applications must expose aria-busy for loading with determinate progress.
  return element.getAttribute('role') === 'progressbar' && !element.hasAttribute('aria-valuenow');
}

export function partitionPending(indicators, root) {
  return {
    inside: indicators.filter((element) => element === root || root.contains(element)),
    outside: indicators.filter((element) => element !== root && !root.contains(element)),
  };
}
