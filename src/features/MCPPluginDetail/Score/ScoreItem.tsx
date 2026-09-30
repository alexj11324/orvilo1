import { cssVar } from 'antd-style';
import { BanIcon, CircleCheckBigIcon, CircleDashedIcon } from 'lucide-react';
import { createElement, type ReactNode } from 'react';
import { memo } from 'react';

import Title from '../Title';

export interface ScoreItemProps {
  check: boolean;
  desc: ReactNode;
  key: string;
  required?: boolean;
  title: ReactNode;
}

const ScoreItem = memo<ScoreItemProps>(({ required, check, desc, title }) => {
  return (
    <div className="flex items-center gap-4 px-4">
      {createElement(check ? CircleCheckBigIcon : required ? BanIcon : CircleDashedIcon, {
        size: 24,
        color: check
          ? cssVar.colorSuccess
          : required
            ? cssVar.colorError
            : cssVar.colorTextQuaternary,
      })}
      <div className="flex flex-col gap-1">
        <Title level={3}>{title}</Title>
        <p style={{ color: cssVar.colorTextSecondary, margin: 0 }}>{desc}</p>
      </div>
    </div>
  );
});

export default ScoreItem;
