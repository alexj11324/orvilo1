import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo } from 'react';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    agent: css`
      padding: 4px;
      border-radius: 2px;
    `,
    agentActive: css`
      background: ${cssVar.colorFillSecondary};
    `,
    bubble: css`
      padding: 6px;
      border: 1px solid color-mix(in srgb, ${cssVar.colorBorderSecondary} 66%, transparent);
      border-radius: 3px;
      background-color: ${cssVar.colorBgContainer};
    `,
    container: css`
      overflow: hidden;
      justify-self: flex-end;

      width: 332px;
      height: 200px;
      border: 1px solid ${cssVar.colorBorder};
      border-radius: ${cssVar.borderRadiusLG};

      background: ${cssVar.colorBgLayout};
    `,
    conversation: css`
      background: ${cssVar.colorBgContainer};
    `,
    header: css`
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    `,
    icon: css`
      flex: none;
      border-radius: 2px;
      background: ${cssVar.colorFillSecondary};
    `,
    input: css`
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    `,
    nav: css`
      padding: 4px;
      border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
      background: ${cssVar.colorBgLayout};
    `,
    sidebar: css`
      padding: 4px;
      border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
      background: ${cssVar.colorBgLayout};
    `,
  };
});

const AgentItem = memo<{
  active?: boolean;
  color?: string;
}>(({ active, color }) => {
  return (
    <div
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: '100%' }}
      className={['flex min-w-0', cx(styles.agent, active && styles.agentActive)]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
        style={{
          flexDirection: 'column',
          width: 12,
          height: 12,
          background: color,
          borderRadius: '50%',
        }}
      />
      <div className={'flex min-w-0'} style={{ flexDirection: 'column', gap: 4, flex: 1 }}>
        <div
          className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
          style={{
            flexDirection: 'column',
            width: '66%',
            height: 2,
            background: cssVar.colorTextTertiary,
          }}
        />
        <div
          className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
          style={{
            flexDirection: 'column',
            width: '100%',
            height: 2,
            background: cssVar.colorTextQuaternary,
          }}
        />
      </div>
    </div>
  );
});

const Preview = memo(() => {
  const nav = (
    <div
      className={['flex min-w-0', styles.nav].filter(Boolean).join(' ')}
      style={{ flexDirection: 'column', alignItems: 'center', gap: 8, width: 24 }}
    >
      <div
        className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
        style={{
          flexDirection: 'column',
          width: 14,
          height: 14,
          border: `2px solid ${cssVar.colorPrimary}`,
          borderRadius: '50%',
        }}
      />
      <div
        className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
        style={{ flexDirection: 'column', width: 12, height: 12 }}
      />
      <div
        className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
        style={{ flexDirection: 'column', width: 12, height: 12 }}
      />
      <div
        className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
        style={{ flexDirection: 'column', width: 12, height: 12 }}
      />
    </div>
  );

  const sidebar = (
    <div
      className={['flex min-w-0', styles.sidebar].filter(Boolean).join(' ')}
      style={{ flexDirection: 'column', gap: 4, width: 72 }}
    >
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'column', gap: 4, paddingInline: 2, paddingTop: 4 }}
      >
        <div
          className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
          style={{ flexDirection: 'column', width: '50%', height: 8 }}
        />
        <div
          className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
          style={{
            flexDirection: 'column',
            width: '100%',
            height: 8,
            background: cssVar.colorFillTertiary,
          }}
        />
      </div>
      <AgentItem />
      <AgentItem active />
      <AgentItem />
      <AgentItem />
    </div>
  );

  const header = (
    <div
      className={['flex min-w-0', styles.header].filter(Boolean).join(' ')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 4,
      }}
    >
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      >
        <div
          className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
          style={{ flexDirection: 'column', width: 12, height: 12, borderRadius: '50%' }}
        />
        <div
          className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
          style={{ flexDirection: 'column', width: 32, height: 8 }}
        />
      </div>
      <div className={'flex min-w-0'} style={{ flexDirection: 'row', gap: 2 }}>
        <div
          className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
          style={{ flexDirection: 'column', width: 10, height: 10 }}
        />
        <div
          className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
          style={{ flexDirection: 'column', width: 10, height: 10 }}
        />
      </div>
    </div>
  );

  const input = (
    <div
      className={['flex min-w-0', styles.input].filter(Boolean).join(' ')}
      style={{
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        height: 48,
        padding: 8,
      }}
    >
      <div
        className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
        style={{ flexDirection: 'column', width: 32, height: 12, background: cssVar.colorPrimary }}
      />
    </div>
  );

  return (
    <div className={`flex rounded-md border border-border ${styles.container}`}>
      {nav}
      {sidebar}
      <div
        className={['flex min-w-0', styles.conversation].filter(Boolean).join(' ')}
        style={{ flexDirection: 'column', flex: 1 }}
      >
        {header}
        <div
          className={'flex min-w-0'}
          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, flex: 1, padding: 6 }}
        >
          <div
            className={'flex min-w-0'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              width: '100%',
            }}
          >
            <div
              className={['flex min-w-0', styles.bubble].filter(Boolean).join(' ')}
              style={{ flexDirection: 'column', gap: 4, width: 64 }}
            >
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '100%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '66%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
            </div>
            <div
              className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
              style={{ flexDirection: 'column', width: 14, height: 14, borderRadius: '50%' }}
            />
          </div>
          <div className={'flex min-w-0'} style={{ flexDirection: 'row', gap: 4 }}>
            <div
              className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
              style={{ flexDirection: 'column', width: 14, height: 14, borderRadius: '50%' }}
            />
            <div
              className={['flex min-w-0', styles.bubble].filter(Boolean).join(' ')}
              style={{ flexDirection: 'column', gap: 4, width: 160 }}
            >
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '100%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '66%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '100%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '100%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '33%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
            </div>
          </div>
          <div
            className={'flex min-w-0'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              width: '100%',
            }}
          >
            <div
              className={['flex min-w-0', styles.bubble].filter(Boolean).join(' ')}
              style={{ flexDirection: 'column', gap: 4, width: 100 }}
            >
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '100%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
              <div
                className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
                style={{
                  flexDirection: 'column',
                  width: '66%',
                  height: 2,
                  background: cssVar.colorTextQuaternary,
                }}
              />
            </div>
            <div
              className={['flex min-w-0', styles.icon].filter(Boolean).join(' ')}
              style={{ flexDirection: 'column', width: 14, height: 14, borderRadius: '50%' }}
            />
          </div>
        </div>
        {input}
      </div>
    </div>
  );
});

export default Preview;
