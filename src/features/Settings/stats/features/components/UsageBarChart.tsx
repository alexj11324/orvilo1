import { type BarChartProps } from '@lobehub/charts';
import { BarChart, ChartTooltipFrame, ChartTooltipRow } from '@lobehub/charts';

import { Separator } from '@/components/ui/separator';
import { formatNumber, formatTokenNumber } from '@/utils/format';

interface UsageBarChartProps extends BarChartProps {
  showType: 'spend' | 'token';
}

export const UsageBarChart = ({ ...props }: UsageBarChartProps) => (
  <BarChart
    {...props}
    customTooltip={({ active, payload, label }) => {
      if (active && payload) {
        const sum = payload.reduce(
          (acc: number, cur: any) => (typeof cur.value === 'number' ? acc + cur.value : acc),
          0,
        );
        return (
          <ChartTooltipFrame>
            <div
              className={'flex min-w-0'}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingBlock: 8,
                paddingInline: 16,
              }}
            >
              <p className={'truncate'} style={{ margin: 0 }}>
                {label}
              </p>
              {sum !== 0 && (
                <span style={{ fontWeight: 'bold' }}>
                  {props.showType === 'spend' ? formatNumber(sum, 2) : formatTokenNumber(sum)}
                </span>
              )}
            </div>
            {sum !== 0 && (
              <>
                <Separator style={{ margin: 0 }} />
                <div
                  className={'flex min-w-0'}
                  style={{
                    gap: 4,
                    paddingBlock: 8,
                    paddingInline: 16,
                    flexDirection: 'column-reverse',
                    marginTop: 4,
                  }}
                >
                  {payload.map(({ value, color, name }: any, idx: number) =>
                    typeof value === 'number' && value > 0 ? (
                      <ChartTooltipRow
                        color={color}
                        key={`id-${idx}`}
                        name={name}
                        value={
                          props.showType === 'spend'
                            ? formatNumber(value, 2)
                            : formatTokenNumber(value)
                        }
                      />
                    ) : null,
                  )}
                </div>
              </>
            )}
          </ChartTooltipFrame>
        );
      }
      return null;
    }}
    valueFormatter={(num) =>
      props.showType === 'spend' ? formatNumber(num, 2) : formatTokenNumber(num)
    }
  />
);
