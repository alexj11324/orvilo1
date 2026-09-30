import { formatUsageValue } from '@orvilo/utils';
import { Divider } from 'antd';
import { cssVar } from 'antd-style';
import { memo } from 'react';

interface TokenProgressItem {
  color: string;
  id: string;
  title: string;
  value: number;
}

interface TokenProgressProps {
  data: TokenProgressItem[];
  showIcon?: boolean;
  showTotal?: string;
}

const TokenProgress = memo<TokenProgressProps>(({ data, showIcon, showTotal }) => {
  const total = data.reduce((acc, item) => acc + item.value, 0);
  return (
    <div className="flex flex-col gap-2 w-[100%]" style={{ position: 'relative' }}>
      <div
        className="flex flex-row h-[6px] w-[100%]"
        style={{
          background: total === 0 ? cssVar.colorFill : undefined,
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {data.map((item) => (
          <div
            className="flex flex-col h-[100%]"
            key={item.id}
            style={{ background: item.color, flex: item.value }}
          />
        ))}
      </div>
      <div className="flex flex-col">
        {data.map((item) => (
          <div className="flex flex-row items-center gap-1 justify-between" key={item.id}>
            <div className="flex flex-row items-center gap-1">
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
        {showTotal && (
          <>
            <Divider style={{ marginBlock: 8 }} />
            <div className="flex flex-row items-center gap-1 justify-between">
              <div style={{ color: cssVar.colorTextSecondary }}>{showTotal}</div>
              <div style={{ fontWeight: 500 }}>{formatUsageValue(total)}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default TokenProgress;
