'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import type { TargetIcon } from 'lucide-react';
import {
  CalendarClockIcon,
  CheckIcon,
  CircleHelpIcon,
  InfinityIcon,
  Layers3Icon,
  PlusIcon,
  TablePropertiesIcon,
  XIcon,
} from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import type { GoalExampleKey, GoalExampleSeed } from './goalExamples';
import { buildGoalExampleSeed, GOAL_EXAMPLE_KEYS } from './goalExamples';
import { createGoalHowItWorksModal } from './GoalHowItWorksModal';

const styles = createStaticStyles(({ css }) => ({
  example: css`
    cursor: pointer;

    padding-block: 12px;
    padding-inline: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    transition: all 0.15s ${cssVar.motionEaseOut};

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  exampleIconBox: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextTertiary};

    background: ${cssVar.colorFillQuaternary};
  `,
  exampleGrid: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;

    @media (width <= 860px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  hero: css`
    isolation: isolate;
    position: relative;

    overflow: hidden;

    padding-block: 40px 32px;
    padding-inline: 40px;

    text-align: center;
  `,
  heroIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 104px;
    height: 72px;

    color: ${cssVar.colorTextTertiary};
  `,
  heroInner: css`
    position: relative;
    z-index: 1;
  `,
  heroLead: css`
    max-width: 560px;
    line-height: 1.7;
  `,
  /* Doubled selectors on purpose: base-ui's text variant pins the colour through
     `&, &:hover, &:active`, so a single-class rule here loses the cascade and the
     hint renders at full text weight. */
  howHint: css`
    margin-inline-end: -8px;

    &&,
    &&:active {
      color: ${cssVar.colorTextTertiary};
    }

    &&:hover {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  judge: css`
    padding-block: 10px;
    padding-inline: 14px;
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorFillQuaternary};
  `,
  section: css`
    padding-block: 24px;
    padding-inline: 40px;
  `,
}));

const EXAMPLE_ICONS: Record<GoalExampleKey, typeof TargetIcon> = {
  backlog: TablePropertiesIcon,
  digest: CalendarClockIcon,
  metric: Layers3Icon,
};

interface GoalEmptyStateProps {
  onCreate: (seed?: GoalExampleSeed) => void;
}

/**
 * First-run empty state for the goal list.
 *
 * A goal only pays off if the user understands the bargain before making one:
 * it runs autonomously, judges itself each round, and spends budget doing it.
 * "Goals will appear here" taught none of that, so this screen carries the
 * concept (what a goal is) and three seeded examples that demonstrate what a
 * *judgeable* outcome reads like. The mechanism — what happens round after
 * round — is one level down, behind the hint sitting opposite the examples
 * heading, so the two things that actually start a goal stay above the fold.
 */
const GoalEmptyState = memo<GoalEmptyStateProps>(({ onCreate }) => {
  const { t } = useTranslation('chat');

  return (
    <div style={{ padding: 0 }}>
      <div className={`flex flex-col items-center ${styles.hero}`}>
        <div className={`flex flex-col items-center gap-4 ${styles.heroInner}`}>
          <div className={styles.heroIcon}>
            <InfinityIcon aria-hidden size={64} strokeWidth={1.75} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="text-[20px] font-semibold">{t('goalEmpty.title')}</div>
            <div className={cn('text-[14px] text-muted-foreground', styles.heroLead)}>
              {t('goalEmpty.lead')}
            </div>
          </div>
          <Button variant="outline" onClick={() => onCreate()}>
            <PlusIcon data-icon="inline-start" />
            {t('goalEmpty.create')}
          </Button>
        </div>
      </div>

      <div className={`flex flex-col gap-3 ${styles.section}`}>
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-muted-foreground font-semibold">
            {t('goalEmpty.examplesTitle')}
          </div>
          <Button
            className={cn(styles.howHint)}
            size="sm"
            variant="ghost"
            onClick={() => createGoalHowItWorksModal()}
          >
            <CircleHelpIcon data-icon="inline-start" />
            {t('goalEmpty.howHint')}
          </Button>
        </div>
        <div className={styles.exampleGrid}>
          {GOAL_EXAMPLE_KEYS.map((key) => {
            const seed = buildGoalExampleSeed(key, (localeKey) => t(localeKey as never));

            return (
              <div
                className={`flex items-center gap-3 ${styles.example}`}
                key={key}
                role={'button'}
                tabIndex={0}
                onClick={() => onCreate(seed)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onCreate(seed);
                }}
              >
                <div className={styles.exampleIconBox}>
                  {createElement(EXAMPLE_ICONS[key], { size: 16 })}
                </div>
                <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
                  <div className="text-[11px] text-muted-foreground">
                    {t(`goalEmpty.examples.${key}.tag` as never)}
                  </div>
                  <div className="line-clamp-2 text-[13px] font-medium">{seed.title}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={`flex flex-col gap-1.5 ${styles.judge}`}>
          <div className="flex items-start gap-2">
            <XIcon color={cssVar.colorError} size={13} style={{ marginBlockStart: 3 }} />
            <div className="text-[12px] text-muted-foreground">{t('goalEmpty.judge.bad')}</div>
          </div>
          <div className="flex items-start gap-2">
            <CheckIcon color={cssVar.colorSuccess} size={13} style={{ marginBlockStart: 3 }} />
            <div className="text-[12px]">{t('goalEmpty.judge.good')}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

GoalEmptyState.displayName = 'GoalEmptyState';

export default GoalEmptyState;
