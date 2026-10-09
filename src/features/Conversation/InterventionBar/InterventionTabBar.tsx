import { cx } from 'antd-style';
import { cn } from 'cn';
import { CheckCheck } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { type PendingIntervention } from '../store/slices/data/pendingInterventions';
import { styles } from './style';

interface InterventionTabBarProps {
  activeIndex: number;
  /**
   * Batch-approval affordance. Omitted entirely by hosts that don't offer one.
   *
   * `count` is the active card's OWN parallel batch, which can be smaller than
   * the tab list: the tab list spans the whole conversation, so it may also
   * hold an abandoned approval from an earlier turn. Bundling count with the
   * handler makes "a button whose label counts calls it won't resolve"
   * unrepresentable.
   */
  approveAll?: { count: number; loading?: boolean; onApprove: () => void };
  interventions: PendingIntervention[];
  onTabChange: (index: number) => void;
}

const InterventionTabBar = memo<InterventionTabBarProps>(
  ({ interventions, activeIndex, approveAll, onTabChange }) => {
    const { t } = useTranslation('chat');

    return (
      <div className={styles.tabBar}>
        {interventions.map((item, index) => (
          <div
            {...clickableProps()}
            key={item.toolCallId}
            className={cn(
              cx(styles.tab, index === activeIndex && styles.tabActive),
              CLICKABLE_FOCUS_RING,
            )}
            onClick={() => onTabChange(index)}
          >
            🔧 {item.apiName}
          </div>
        ))}
        <div className={styles.tabTrailing}>
          <span className={styles.tabCounter}>
            {activeIndex + 1} / {interventions.length}
          </span>
          {/* Only shown for a real batch: with one pending call in the active
              turn the per-card Submit already IS "approve all", and a second
              button beside it would just add a decision the user doesn't have
              to make. */}
          {approveAll && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <Button
                        loading={approveAll.loading}
                        size="sm"
                        variant="secondary"
                        onClick={approveAll.onApprove}
                      >
                        <CheckCheck data-icon="inline-start" />{' '}
                        {t('tool.intervention.approveAll', { count: approveAll.count })}
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>
                  {t('tool.intervention.approveAllTooltip', { count: approveAll.count })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    );
  },
);

export default InterventionTabBar;
