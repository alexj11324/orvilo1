'use client';

import { cn } from 'cn';
import { FileText, FolderPlus, Search, X } from 'lucide-react';
import { createElement, memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useConversationStore } from '@/features/Conversation/store';
import { useGlobalStore } from '@/store/global';

const styles = {
  card: 'flex min-h-33.75 min-w-0 flex-1 cursor-pointer flex-col items-start gap-1.5 rounded-(--radius-card) border border-divider bg-card p-4 text-start transition-[background-color,border-color] duration-(--orvilo-motion-fast) ease-[ease] hover:border-border hover:bg-fill-quaternary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring/50 focus-visible:outline-offset-[-1px] motion-reduce:transition-none',
  cardDesc: 'text-sm leading-5.5 font-normal text-foreground-description',
  cardTitle: 'text-sm leading-5.5 font-medium text-foreground',
  header: 'text-sm leading-5.5 font-normal text-foreground-description',
  icon: 'text-muted-foreground',
  // Nonessential appearance follows DESIGN's 100–200ms state-change window.
  root: 'animate-[orvilo-agent-example-reveal_var(--orvilo-motion-mid,200ms)_ease] motion-reduce:animate-none',
} as const;

const EXAMPLES = [
  {
    descKey: 'examples.createProject.desc',
    icon: FolderPlus,
    key: 'createProject',
    titleKey: 'examples.createProject.title',
  },
  {
    descKey: 'examples.researchTopic.desc',
    icon: Search,
    key: 'researchTopic',
    titleKey: 'examples.researchTopic.title',
  },
  {
    descKey: 'examples.draftUpdate.desc',
    icon: FileText,
    key: 'draftUpdate',
    titleKey: 'examples.draftUpdate.title',
  },
] as const;

/**
 * How long after mount the examples block reveals. The reference renders a
 * bare centered composer first and only later lifts it when the examples
 * arrive (state A → B, observed 11–20s — the reference's data latency, not a
 * designed wait). A short delay reproduces that progressive reveal — and the
 * composer's natural lift inside the shared group — without the wait.
 */
const REVEAL_DELAY_MS = 1000;

/**
 * The reference's `Get started with some examples` block — three clickable
 * prompt cards under the centered landing composer, dismissible via `Dismiss`.
 *
 * Clicking a card fills the composer with the card's title (the prompt-shaped
 * text) and focuses it — the same mechanism `OpeningQuestions` uses. Dismissal
 * persists in system status, matching the reference's settled state.
 */
const ExamplePrompts = memo(() => {
  const { t } = useTranslation('chat');
  const dismissed = useGlobalStore((s) => s.status.inboxAgentExamplesDismissed);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const fillInputMessage = useConversationStore((s) => s.fillInputMessage);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed || !revealed) return null;

  return (
    // The composer card sits 16px in from the 744px landing group (via
    // WideScreenContainer's paddingInline) — the same inset keeps the
    // examples row flush with the card edges (712px, like the reference).
    <div className={cn('flex flex-col gap-2 px-4', styles.root)} data-testid="inbox-agent-examples">
      <div className="flex items-center justify-between">
        <span className={styles.header}>{t('examples.title')}</span>
        <span className="inline-flex flex-none pointer-coarse:p-1.5">
          <ActionIcon
            aria-label={t('examples.dismiss')}
            className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-1.75 pointer-coarse:after:content-['']"
            icon={X}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={t('examples.dismiss')}
            variant={'borderless'}
            onClick={() => updateSystemStatus({ inboxAgentExamplesDismissed: true })}
          />
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        {EXAMPLES.map(({ icon, key, titleKey, descKey }) => (
          <button
            className={styles.card}
            data-testid={`inbox-agent-example-${key}`}
            key={key}
            type={'button'}
            onClick={() => fillInputMessage(t(titleKey))}
          >
            {createElement(icon, { className: styles.icon, size: 16 })}
            <span className={styles.cardTitle}>{t(titleKey)}</span>
            <span className={styles.cardDesc}>{t(descKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

ExamplePrompts.displayName = 'ExamplePrompts';

export default ExamplePrompts;
