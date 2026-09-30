import { createStaticStyles, cssVar, responsive } from 'antd-style';
import { cn } from 'cn';
import { type CSSProperties, type ReactNode } from 'react';
import { memo } from 'react';

import { Spinner as Spin } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const prefixCls = 'ant';

const styles = createStaticStyles(({ css, cssVar }) => ({
  header: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    ${responsive.sm} {
      flex-wrap: wrap;
      margin-block-end: 8px;
    }
  `,
  statistic: css`
    .${prefixCls}-statistic-content-value-int, .${prefixCls}-statistic-content-value-decimal {
      font-size: 24px;
      font-weight: bold;
      line-height: 1.2;
    }
  `,
  title: css`
    overflow: hidden;
    flex: 1;

    font-size: 16px;
    font-weight: 500;
    line-height: 32px;
    color: ${cssVar.colorText};

    ${responsive.sm} {
      font-size: 14px;
      line-height: 16px;
    }
  `,
}));

export interface StatisticConfig {
  description?: ReactNode;
  precision?: number;
  prefix?: ReactNode;
  style?: CSSProperties;
  suffix?: ReactNode;
  value?: number | string;
  valueStyle?: CSSProperties;
}

export interface StatisticCardProps {
  className?: string;
  extra?: ReactNode;
  loading?: boolean;
  padding?: number;
  paddingBlock?: number;
  paddingInline?: number;
  statistic?: StatisticConfig;
  style?: CSSProperties;
  title?: ReactNode;
  variant?: 'borderless' | 'filled' | 'outlined';
}

const formatStatistic = (value: number | string | undefined, precision?: number) => {
  if (value === undefined || value === null) return { decimal: '', int: '' };
  if (typeof value === 'number' && typeof precision === 'number') {
    const [int, dec] = value
      .toLocaleString('en-US', {
        maximumFractionDigits: precision,
        minimumFractionDigits: precision,
      })
      .split('.');
    return { decimal: dec ? `.${dec}` : '', int };
  }
  return { decimal: '', int: String(value) };
};

interface StatisticViewProps {
  className?: string;
  precision?: number;
  prefix?: ReactNode;
  style?: CSSProperties;
  suffix?: ReactNode;
  value?: number | string;
}

const StatisticView = ({
  value,
  precision,
  prefix,
  suffix,
  className,
  style,
}: StatisticViewProps) => {
  const { int, decimal } = formatStatistic(value, precision);
  return (
    <div className={cn('ant-statistic', className)}>
      <div className={'ant-statistic-content'} style={style}>
        {prefix && <span className={'ant-statistic-content-prefix'}>{prefix}</span>}
        <span className={'ant-statistic-content-value'}>
          <span className={'ant-statistic-content-value-int'}>{int}</span>
          {decimal && <span className={'ant-statistic-content-value-decimal'}>{decimal}</span>}
        </span>
        {suffix && <span className={'ant-statistic-content-suffix'}>{suffix}</span>}
      </div>
    </div>
  );
};

const StatisticCard = memo<StatisticCardProps>(
  ({
    title,
    className,
    variant = 'borderless',
    loading,
    extra,
    style,
    padding,
    paddingBlock,
    paddingInline,
    statistic,
  }) => {
    return (
      <div
        className={cn('flex-1', className)}
        style={{
          ...(variant === 'outlined' && {
            border: `1px solid ${cssVar.colorBorderSecondary}`,
            borderRadius: cssVar.borderRadiusLG,
          }),
          ...(variant === 'filled' && { background: cssVar.colorFillQuaternary }),
          padding,
          paddingBlock,
          paddingInline,
          ...style,
        }}
      >
        <div className={styles.header}>
          <div className={styles.title}>
            {typeof title === 'string' ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <h2
                      className="line-clamp-1"
                      style={{
                        fontSize: 'inherit',
                        fontWeight: 'inherit',
                        lineHeight: 'inherit',
                        margin: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {title}
                    </h2>
                  }
                />
                <TooltipContent>{title}</TooltipContent>
              </Tooltip>
            ) : (
              title
            )}
          </div>
          {loading ? <Spin size={'small'} /> : extra}
        </div>
        {statistic && (
          <div className={'flex flex-col gap-4'} style={{ ...statistic.style }}>
            <StatisticView
              className={styles.statistic}
              precision={statistic.precision}
              prefix={statistic.prefix}
              style={statistic.valueStyle}
              suffix={statistic.suffix}
              value={statistic.value}
            />
            {statistic.description}
          </div>
        )}
      </div>
    );
  },
);

export default StatisticCard;
