import { formatUsageValue } from '@orvilo/utils';
import { cssVar } from 'antd-style';
import { memo } from 'react';

export interface TokenProgressItem {
  color: string;
  id: string;
  title: string;
  value: number;
}

interface TokenProgressProps {
  data: TokenProgressItem[];
  showIcon?: boolean;
}

const TokenProgress = memo<TokenProgressProps>(({ data, showIcon }) => {
  const total = data.reduce((acc, item) => acc + item.value, 0);

  return (
    <div className="flex flex-col gap-2" style={{ width: '100%', position: 'relative' }}>
      <div
        className="flex"
        style={{
          height: 6,
          width: '100%',

          background: total === 0 ? cssVar.colorFill : undefined,
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {data.map((item) => (
          <div
            className="flex flex-col"
            key={item.id}
            style={{ height: '100%', background: item.color, flex: item.value }}
          />
        ))}
      </div>
      <div className="flex flex-col">
        {data.map((item) => (
          <div className="flex items-center gap-1 justify-between" key={item.id}>
            <div className="flex items-center gap-1">
              {showIcon && (
                <div
                  style={{
                    background: item.color,
                    borderRadius: '50%',
                    flex: 'none',
                    height: 6,
                    width: 6,
                  }}
                />
              )}
              <div style={{ color: cssVar.colorTextSecondary }}>{item.title}</div>
            </div>
            <div style={{ fontWeight: 500 }}>{formatUsageValue(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default TokenProgress;
