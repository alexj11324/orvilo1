'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, keyframes } from 'antd-style';
import { FileText, FolderPlus, Search, X } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConversationStore } from '@/features/Conversation/store';
import { useGlobalStore } from '@/store/global';

const reveal = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const styles = createStaticStyles(({ css }) => ({
  card: css`
    cursor: pointer;

    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;

    min-width: 0;
    min-height: 135px;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    text-align: start;

    background: ${cssVar.colorBgContainer};

    transition:
      background 0.15s,
      border-color 0.15s;

    &:hover {
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillQuaternary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -1px;
    }
  `,
  cardDesc: css`
    font-size: 12px;
    font-weight: 450;
    line-height: 1.5;
    color: ${cssVar.colorTextDescription};
  `,
  cardTitle: css`
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
  header: css`
    font-size: 12px;
    font-weight: 450;
    color: ${cssVar.colorTextDescription};
  `,
  icon: css`
    color: ${cssVar.colorTextSecondary};
  `,
  root: css`
    animation: ${reveal} 0.45s ease;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `,
}));

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
    <Flexbox className={styles.root} data-testid="inbox-agent-examples" gap={8} paddingInline={16}>
      <Flexbox horizontal align={'center'} justify={'space-between'}>
        <span className={styles.header}>{t('examples.title')}</span>
        <ActionIcon
          aria-label={t('examples.dismiss')}
          icon={X}
          size={{ blockSize: 24, size: 14 }}
          title={t('examples.dismiss')}
          variant={'borderless'}
          onClick={() => updateSystemStatus({ inboxAgentExamplesDismissed: true })}
        />
      </Flexbox>
      <Flexbox horizontal gap={8} style={{ alignItems: 'stretch' }}>
        {EXAMPLES.map(({ icon, key, titleKey, descKey }) => (
          <button
            className={styles.card}
            data-testid={`inbox-agent-example-${key}`}
            key={key}
            type={'button'}
            onClick={() => fillInputMessage(t(titleKey))}
          >
            <Icon className={styles.icon} icon={icon} size={16} />
            <span className={styles.cardTitle}>{t(titleKey)}</span>
            <span className={styles.cardDesc}>{t(descKey)}</span>
          </button>
        ))}
      </Flexbox>
    </Flexbox>
  );
});

ExamplePrompts.displayName = 'ExamplePrompts';

export default ExamplePrompts;
