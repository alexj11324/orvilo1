'use client';

import { Tag, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { ShieldCheck } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import AccordionArrowIcon from '../shared/AccordionArrowIcon';

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
        className="flex items-center gap-2 px-2 py-1"
        style={{ cursor: 'pointer', width: 'fit-content' }}
        onClick={onToggle}
      >
        <ShieldCheck color={cssVar.colorTextDescription} size={16} />
        <Text color={cssVar.colorTextSecondary} fontSize={13} weight={500}>
          {t('taskDetail.acceptance.title')}
        </Text>
        {Boolean(count) && <Tag size={'small'}>{count}</Tag>}
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
