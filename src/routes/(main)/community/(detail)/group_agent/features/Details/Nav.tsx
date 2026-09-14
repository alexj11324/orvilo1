'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Tabs } from '@lobehub/ui/base-ui';
import { SOCIAL_URL } from '@orvilo/business-const';
import { createStaticStyles } from 'antd-style';
import { BookOpenIcon, HistoryIcon, SquareUserIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    link: css`
      color: ${cssVar.colorTextDescription};

      &:hover {
        color: ${cssVar.colorInfo};
      }
    `,
    nav: css`
      border-block-end: 1px solid ${cssVar.colorBorder};
    `,
  };
});

export enum GroupAgentNavKey {
  Overview = 'overview',
  SystemRole = 'systemRole',
  Versions = 'versions',
}

interface NavProps {
  activeTab?: GroupAgentNavKey;
  mobile?: boolean;
  setActiveTab?: (tab: GroupAgentNavKey) => void;
}

const Nav = memo<NavProps>(({ mobile, setActiveTab, activeTab = GroupAgentNavKey.Overview }) => {
  const { t } = useTranslation('discover');

  const nav = (
    <Tabs
      activeKey={activeTab}
      variant="square"
      items={[
        {
          icon: <Icon icon={BookOpenIcon} size={16} />,
          key: GroupAgentNavKey.Overview,
          label: t('groupAgents.details.overview.title', { defaultValue: 'Overview' }),
        },
        {
          icon: <Icon icon={SquareUserIcon} size={16} />,
          key: GroupAgentNavKey.SystemRole,
          label: t('groupAgents.details.systemRole.title', { defaultValue: 'System Role' }),
        },
        {
          icon: <Icon icon={HistoryIcon} size={16} />,
          key: GroupAgentNavKey.Versions,
          label: t('groupAgents.details.versions.title', { defaultValue: 'Versions' }),
        },
      ]}
      onChange={(key) => setActiveTab?.(key as GroupAgentNavKey)}
    />
  );

  return mobile ? (
    nav
  ) : (
    <Flexbox horizontal align={'center'} className={styles.nav} justify={'space-between'}>
      {nav}
      {/* The community link is the only entry in this group, so a deployment
          without a server drops the group instead of leaving an empty row
          reserving its start margin. */}
      {SOCIAL_URL.discord && (
        <Flexbox
          horizontal
          flex="none"
          gap={12}
          style={{ marginInlineStart: 12, whiteSpace: 'nowrap' }}
        >
          <a className={styles.link} href={SOCIAL_URL.discord} rel="noreferrer" target="_blank">
            {t('groupAgents.details.nav.needHelp', { defaultValue: 'Need help?' })}
          </a>
        </Flexbox>
      )}
    </Flexbox>
  );
});

export default Nav;
