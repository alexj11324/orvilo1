'use client';

import { isDesktop } from '@orvilo/const';
import { PanelRightIcon } from 'lucide-react';
import { memo, type MouseEvent, type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useGlobalStore } from '@/store/global';

import referenceStyles from '../../ReferenceRender.module.css';

const styles = {
  icon: 'inline-flex me-1 align-[-0.15em]',
  sideBrowser:
    'text-foreground-tertiary transition-[color] duration-(--orvilo-motion-mid) ease-[ease] hover:text-foreground',
  wrapper: 'inline-flex gap-0.5 items-center',
};

interface LinkChipProps {
  href?: string;
  icon?: ReactNode;
  label: string;
}

const isWebUrl = (href?: string) => !!href && /^https?:\/\//i.test(href);

const LinkChip = memo<LinkChipProps>(({ href, icon, label }) => {
  const { t } = useTranslation('chat');
  const openInBrowserTab = useGlobalStore((s) => s.openInBrowserTab);

  const openInSideBrowser = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      openInBrowserTab(href!);
    },
    [href, openInBrowserTab],
  );

  const link = (
    <a
      className={referenceStyles.linkChip}
      data-slot="markdown-link"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {label}
    </a>
  );

  if (!isDesktop || !isWebUrl(href)) return link;

  return (
    <span className={styles.wrapper}>
      {link}
      {/* Must stay OUTSIDE the anchor: the desktop preload matches clicks with
          `closest('a')` in the capture phase and stops propagation, so a button
          nested inside the link would never reach this onClick. */}
      <ActionIcon
        data-side-browser
        className={styles.sideBrowser}
        classNames={{ icon: 'size-4' }}
        icon={PanelRightIcon}
        size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
        title={t('messageLink.openInSideBrowser')}
        onClick={openInSideBrowser}
      />
    </span>
  );
});

LinkChip.displayName = 'LinkChip';

export default LinkChip;
