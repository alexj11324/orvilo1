'use client';

import { cssVar, cx } from 'antd-style';
import { ChevronRightIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { buttonHoverFeedback } from '@/components/ui/button';
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
    <div className="flex flex-col gap-2">
      <div className="text-[12px] text-muted-foreground">
        {t('domains.title')} {domains.length}
      </div>
      <div
        className="flex flex-col p-0 border"
        style={{ borderColor: cssVar.colorBorderSecondary, background: cssVar.colorBgContainer }}
      >
        {domains.map((d) => (
          <button
            className={cx(cx(styles.row, 'flex items-center gap-3'), buttonHoverFeedback)}
            data-hover-paint="shadow"
            key={d.id}
            type={'button'}
            style={{
              background: 'transparent',
              color: 'inherit',
              textAlign: 'start',
              width: '100%',
            }}
            onClick={() => onOpen(d.id)}
          >
            <div className="font-medium" style={{ flex: 'none', width: 140 }}>
              {d.title}
            </div>
            <div className="text-muted-foreground" style={{ fontSize: 12.5, flex: 1 }}>
              {t('domains.meta', { habits: d.lessons.length, runs: d.runCount })}
            </div>
            <ChevronRightIcon size={13} style={{ flex: 'none', opacity: 0.4 }} />
          </button>
        ))}
      </div>
    </div>
  );
});

DomainList.displayName = 'ExpertiseDomainList';

export default DomainList;
