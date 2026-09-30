import { cssVar } from 'antd-style';

const BubblesLoading = () => {
  return (
    <div className={'flex items-center justify-center gap-1'} style={{ height: 24, width: 32 }}>
      {[0, 1, 2].map((i) => (
        <span
          className={'animate-pulse rounded-full'}
          key={i}
          style={{
            animationDelay: `${i * 160}ms`,
            background: cssVar.colorTextSecondary,
            height: 12,
            width: 12,
          }}
        />
      ))}
    </div>
  );
};

export default BubblesLoading;
