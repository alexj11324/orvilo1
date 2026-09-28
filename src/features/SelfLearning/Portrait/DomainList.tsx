'use client';

import { Block, Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { ChevronRightIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ExpertiseDomainItem } from '@/services/expertise';

import { portraitStyles as styles } from './styles';

interface DomainListProps {
  domains: ExpertiseDomainItem[];
  onOpen: (domainId: string) => void;
}

/**
 * 多个方向时的方向清单，也是这一页唯一说「作用范围」的地方之一：每个方向带规则数与实践数。
 *
 * 它原来每行还有一根可靠度条和一个词（老毛病 / 还不稳 / 已养成）。S60 去掉了那些词 —— 方向
 * 的规模用数字说清楚就够了，判断留给读规则的人。
 */
const DomainList = memo<DomainListProps>(({ domains, onOpen }) => {
  const { t } = useTranslation('selfLearning');
  return (
    <Flexbox gap={8}>
      <Text fontSize={12} type={'secondary'}>
        {t('domains.title')} {domains.length}
      </Text>
      <Block padding={0} variant={'outlined'}>
        {domains.map((d) => (
          <Flexbox
            horizontal
            align={'center'}
            as={'button'}
            className={styles.row}
            gap={12}
            key={d.id}
            style={{
              background: 'transparent',
              color: 'inherit',
              textAlign: 'start',
              width: '100%',
            }}
            onClick={() => onOpen(d.id)}
          >
            <Text style={{ flex: 'none', width: 140 }} weight={500}>
              {d.title}
            </Text>
            <Text fontSize={12.5} style={{ flex: 1 }} type={'secondary'}>
              {t('domains.meta', { habits: d.lessons.length, runs: d.runCount })}
            </Text>
            <Icon icon={ChevronRightIcon} size={13} style={{ flex: 'none', opacity: 0.4 }} />
          </Flexbox>
        ))}
      </Block>
    </Flexbox>
  );
});

DomainList.displayName = 'ExpertiseDomainList';

export default DomainList;
