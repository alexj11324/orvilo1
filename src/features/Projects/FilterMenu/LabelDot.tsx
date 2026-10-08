import { memo } from 'react';

/** A label's color swatch. Dynamic data color goes through SVG `fill`, not inline style. */
const LabelDot = memo<{ color?: null | string }>(({ color }) => (
  <svg
    aria-hidden
    className="flex-none text-muted-foreground"
    height={10}
    viewBox="0 0 10 10"
    width={10}
  >
    <circle cx={5} cy={5} fill={color ?? 'currentColor'} r={5} />
  </svg>
));

LabelDot.displayName = 'LabelDot';

export default LabelDot;
