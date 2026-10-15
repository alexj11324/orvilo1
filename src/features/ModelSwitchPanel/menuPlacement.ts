export type DropdownPlacement =
  | 'top'
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight'
  | 'left'
  | 'leftTop'
  | 'leftBottom'
  | 'right'
  | 'rightTop'
  | 'rightBottom';

export function resolveModelMenuPlacement(placement: DropdownPlacement): {
  side: 'top' | 'bottom' | 'left' | 'right';
  align: 'start' | 'center' | 'end';
} {
  const side = placement.startsWith('top')
    ? 'top'
    : placement.startsWith('bottom')
      ? 'bottom'
      : placement.startsWith('left')
        ? 'left'
        : 'right';
  const align =
    placement.endsWith('Left') || placement.endsWith('Top')
      ? 'start'
      : placement.endsWith('Right') || placement.endsWith('Bottom')
        ? 'end'
        : 'center';
  return { side, align };
}
