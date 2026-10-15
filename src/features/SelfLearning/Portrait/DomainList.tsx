'use client';

import { cn } from 'cn';
import { ChevronRightIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
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
      <div className="text-xs text-muted-foreground">
        {t('domains.title')} {domains.length}
      </div>
      <div className="flex flex-col p-0 border border-divider bg-card">
        {domains.map((d) => (
          <Button
            key={d.id}
            type="button"
            variant="ghost"
            className={cn(
              styles.row,
              'flex h-auto min-h-9 pointer-coarse:min-h-11 w-full items-center gap-3 justify-start rounded-none font-normal text-foreground text-start whitespace-normal',
            )}
            onClick={() => onOpen(d.id)}
          >
            <div className="flex-none w-35 text-sm leading-5.5 font-medium">{d.title}</div>
            <div className="flex-1 text-xs leading-5 text-muted-foreground">
              {t('domains.meta', { habits: d.lessons.length, runs: d.runCount })}
            </div>
            <ChevronRightIcon className="flex-none size-4 text-muted-foreground" size={16} />
          </Button>
        ))}
      </div>
    </div>
  );
});

DomainList.displayName = 'ExpertiseDomainList';

export default DomainList;
