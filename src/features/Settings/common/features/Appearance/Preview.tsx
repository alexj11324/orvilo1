import { cn } from 'cn';
import { memo } from 'react';

const styles = {
  agent: 'p-1 rounded-(--radius-chip)',
  agentActive: 'bg-selected',
  bubble: 'p-1.5 border border-divider/66 rounded-(--radius-card) bg-card',
  container:
    'overflow-hidden justify-self-end w-83 h-50 border border-border rounded-(--radius-card) bg-background',
  conversation: 'bg-card',
  header: 'border-be border-divider',
  icon: 'flex-none rounded-(--radius-chip) bg-selected',
  input: 'border-bs border-divider',
  nav: 'p-1 border-e border-divider bg-background',
  sidebar: 'p-1 border-e border-divider bg-background',
};

const AgentItem = memo<{
  active?: boolean;
  color?: string;
}>(({ active, color }) => {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-row items-center gap-1 w-full',
        styles.agent,
        active && styles.agentActive,
      )}
    >
      <div
        className={cn('flex min-w-0', styles.icon, 'flex-col w-3 h-3 rounded-full')}
        style={{ background: color }}
      />
      <div className={cn('flex min-w-0', 'flex-col gap-1 flex-1')}>
        <div
          className={cn(
            'flex min-w-0',
            styles.icon,
            'flex-col w-[66%] h-0.5 bg-foreground-tertiary',
          )}
        />
        <div
          className={cn(
            'flex min-w-0',
            styles.icon,
            'flex-col w-full h-0.5 bg-foreground-quaternary',
          )}
        />
      </div>
    </div>
  );
});

const Preview = memo(() => {
  const nav = (
    <div className={cn('flex min-w-0', styles.nav, 'flex-col items-center gap-2 w-6')}>
      <div
        className={cn(
          'flex min-w-0',
          styles.icon,
          'flex-col w-3.5 h-3.5 border-2 border-primary rounded-full',
        )}
      />
      <div className={cn('flex min-w-0', styles.icon, 'flex-col w-3 h-3')} />
      <div className={cn('flex min-w-0', styles.icon, 'flex-col w-3 h-3')} />
      <div className={cn('flex min-w-0', styles.icon, 'flex-col w-3 h-3')} />
    </div>
  );

  const sidebar = (
    <div className={cn('flex min-w-0', styles.sidebar, 'flex-col gap-1 w-18')}>
      <div className={cn('flex min-w-0', 'flex-col gap-1 px-0.5 pbs-1')}>
        <div className={cn('flex min-w-0', styles.icon, 'flex-col w-1/2 h-2')} />
        <div className={cn('flex min-w-0', styles.icon, 'flex-col w-full h-2 bg-accent')} />
      </div>
      <AgentItem />
      <AgentItem active />
      <AgentItem />
      <AgentItem />
    </div>
  );

  const header = (
    <div className={cn('flex min-w-0', styles.header, 'flex-row items-center justify-between p-1')}>
      <div className={cn('flex min-w-0', 'flex-row items-center gap-1')}>
        <div className={cn('flex min-w-0', styles.icon, 'flex-col w-3 h-3 rounded-full')} />
        <div className={cn('flex min-w-0', styles.icon, 'flex-col w-8 h-2')} />
      </div>
      <div className={cn('flex min-w-0', 'flex-row gap-0.5')}>
        <div className={cn('flex min-w-0', styles.icon, 'flex-col w-2.5 h-2.5')} />
        <div className={cn('flex min-w-0', styles.icon, 'flex-col w-2.5 h-2.5')} />
      </div>
    </div>
  );

  const input = (
    <div className={cn('flex min-w-0', styles.input, 'flex-col items-end justify-end h-12 p-2')}>
      <div className={cn('flex min-w-0', styles.icon, 'flex-col w-8 h-3 bg-primary')} />
    </div>
  );

  return (
    <div className={`flex rounded-(--radius-card) border border-border ${styles.container}`}>
      {nav}
      {sidebar}
      <div className={cn('flex min-w-0', styles.conversation, 'flex-col flex-1')}>
        {header}
        <div className={cn('flex min-w-0', 'flex-col items-start gap-2 flex-1 p-1.5')}>
          <div className={cn('flex min-w-0', 'flex-row items-center justify-end gap-1 w-full')}>
            <div className={cn('flex min-w-0', styles.bubble, 'flex-col gap-1 w-16')}>
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-full h-0.5 bg-foreground-quaternary',
                )}
              />
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-[66%] h-0.5 bg-foreground-quaternary',
                )}
              />
            </div>
            <div className={cn('flex min-w-0', styles.icon, 'flex-col w-3.5 h-3.5 rounded-full')} />
          </div>
          <div className={cn('flex min-w-0', 'flex-row gap-1')}>
            <div className={cn('flex min-w-0', styles.icon, 'flex-col w-3.5 h-3.5 rounded-full')} />
            <div className={cn('flex min-w-0', styles.bubble, 'flex-col gap-1 w-40')}>
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-full h-0.5 bg-foreground-quaternary',
                )}
              />
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-[66%] h-0.5 bg-foreground-quaternary',
                )}
              />
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-full h-0.5 bg-foreground-quaternary',
                )}
              />
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-full h-0.5 bg-foreground-quaternary',
                )}
              />
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-[33%] h-0.5 bg-foreground-quaternary',
                )}
              />
            </div>
          </div>
          <div className={cn('flex min-w-0', 'flex-row items-center justify-end gap-1 w-full')}>
            <div className={cn('flex min-w-0', styles.bubble, 'flex-col gap-1 w-25')}>
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-full h-0.5 bg-foreground-quaternary',
                )}
              />
              <div
                className={cn(
                  'flex min-w-0',
                  styles.icon,
                  'flex-col w-[66%] h-0.5 bg-foreground-quaternary',
                )}
              />
            </div>
            <div className={cn('flex min-w-0', styles.icon, 'flex-col w-3.5 h-3.5 rounded-full')} />
          </div>
        </div>
        {input}
      </div>
    </div>
  );
});

export default Preview;
