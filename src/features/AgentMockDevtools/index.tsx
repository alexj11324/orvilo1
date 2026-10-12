import { cn } from 'cn';
import { memo } from 'react';
import { useMatches } from 'react-router';

import { devDockPanelStyles } from '@/features/DevDock/panelStyles';

import { Controls } from './Controls';

const styles = {
  notice: 'block shrink-0 p-4 border-be border-divider text-sm leading-5.5',
};

const AgentMockPanel = memo(() => {
  const matches = useMatches();
  const isAgentTopicRoute = matches.some((m) => 'topicId' in m.params);

  return (
    <div className={devDockPanelStyles.root}>
      {!isAgentTopicRoute && (
        <div className={cn('text-sm leading-5.5', 'text-muted-foreground', styles.notice)}>
          Open an agent topic conversation to replay mock cases into it.
        </div>
      )}
      <Controls />
    </div>
  );
});

AgentMockPanel.displayName = 'AgentMockPanel';

export default AgentMockPanel;
