'use client';

import { cssVar } from 'antd-style';
import { cn } from 'cn';
import { ShieldCheck } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge as Tag } from '@/components/reui/badge';

import AccordionArrowIcon from '../shared/AccordionArrowIcon';
import { PRESSABLE_FOCUS_CLASS, pressableProps } from '../shared/pressableProps';

interface TaskAcceptanceHeaderProps {
  count?: number;
  /** Section-level action (e.g. open the full report), outside the toggle. */
  extra?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

/** Canonical Task detail header shared by acceptance definition and result modes. */
export const TaskAcceptanceHeader = memo<TaskAcceptanceHeaderProps>(
  ({ count, extra, isOpen, onToggle }) => {
    const { t } = useTranslation('chat');

    const toggle = (
      <div
        aria-expanded={isOpen}
        className={cn('flex items-center gap-2 px-2 py-1', PRESSABLE_FOCUS_CLASS)}
        style={{ cursor: 'pointer', width: 'fit-content' }}
        {...pressableProps(onToggle)}
      >
        <ShieldCheck color={cssVar.colorTextDescription} size={16} />
        <div className="text-sm font-medium" style={{ color: cssVar.colorTextSecondary }}>
          {t('taskDetail.acceptance.title')}
        </div>
        {Boolean(count) && <Tag size="sm">{count}</Tag>}
        <AccordionArrowIcon isOpen={isOpen} style={{ color: cssVar.colorTextDescription }} />
      </div>
    );

    if (!extra) return toggle;

    return (
      <div className="flex items-center justify-between">
        {toggle}
        {/* Lives outside the toggle: opening the report should not also fold
          the section the user is reading. */}
        <div className="flex flex-col" onClick={(event) => event.stopPropagation()}>
          {extra}
        </div>
      </div>
    );
  },
);

TaskAcceptanceHeader.displayName = 'TaskAcceptanceHeader';
