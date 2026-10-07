/** Rendered hover judge; text, border and ancestor-only changes do not count. */
const composite = (rgba, backdrop, opacity = 1) => {
  const alpha = rgba[3] * opacity;
  return rgba.slice(0, 3).map((value, i) => value * alpha + backdrop[i] * (1 - alpha));
};

const paintLayers = (snapshot, backdrop) => {
  let painted = composite(snapshot.background, backdrop);
  for (const layer of snapshot.pseudos) {
    if (layer.visible) painted = composite(layer.background, painted, layer.opacity);
  }
  return composite([...painted, 1], backdrop, snapshot.opacity);
};

export const hasVisibleHover = (before, after) => {
  if (before.opacity === 0 || after.opacity === 0) return false;
  // Both states share the pre-hover ancestor backdrop. Owned pseudo paint
  // goes over the control's own fill, not directly over its ancestors.
  const resting = paintLayers(before, before.backdrop);
  const hovered = paintLayers(after, before.backdrop);
  const fill = hovered.some((value, i) => Math.abs(value - resting[i]) >= 3);
  const shadowChanged = (previous, current) =>
    current.visible &&
    current.opacity > 0 &&
    current.shadowVisible &&
    (previous.shadow !== current.shadow ||
      !previous.visible ||
      previous.opacity !== current.opacity);
  return (
    fill ||
    shadowChanged(before, after) ||
    after.pseudos.some((layer, index) => shadowChanged(before.pseudos[index], layer))
  );
};

export const assertHoverFeedback = (name, before, after) => {
  if (!hasVisibleHover(before, after)) {
    throw new Error(`${name}: enabled control has no visible hover fill or shadow`);
  }
};

export const assertHoverCoverage = (names, required, minimum) => {
  if (names.length < minimum)
    throw new Error(`Hover coverage: ${names.length} controls < ${minimum}`);
  const missing = required.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`Hover coverage missing: ${missing.join(', ')}`);
};
