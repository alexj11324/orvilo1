import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Star } from 'lucide-react';
import { memo } from 'react';

const styles = createStaticStyles(({ css }) => {
  return {
    rate: css`
      display: flex;
      align-items: center;
    `,
    star: css`
      position: relative;
      display: inline-flex;
    `,
    starFill: css`
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 0;

      overflow: hidden;
      display: inline-flex;
    `,
  };
});

interface RateProps {
  allowHalf?: boolean;
  className?: string;
  color?: string;
  count?: number;
  gap?: number;
  size?: number;
  style?: React.CSSProperties;
  value?: number;
}

const Rate = memo<RateProps>(
  ({
    allowHalf = true,
    className,
    color = cssVar.colorWarning,
    count = 5,
    gap,
    size = 16,
    style,
    value = 0,
  }) => {
    return (
      <div className={cx(styles.rate, className)} style={{ gap: gap || size / 2, ...style }}>
        {Array.from({ length: count }).map((_, index) => {
          const remaining = value - index;
          const fillRatio =
            remaining >= 1 ? 1 : allowHalf && remaining >= 0.5 ? 0.5 : Math.max(remaining, 0);
          return (
            <span className={styles.star} key={index}>
              <Star
                fill={cssVar.colorFill}
                height={size}
                strokeWidth={0}
                style={{ color: cssVar.colorFill }}
                width={size}
              />
              <span className={styles.starFill} style={{ width: `${fillRatio * 100}%` }}>
                <Star fill={color} height={size} strokeWidth={0} style={{ color }} width={size} />
              </span>
            </span>
          );
        })}
      </div>
    );
  },
);

Rate.displayName = 'Rate';

export default Rate;
