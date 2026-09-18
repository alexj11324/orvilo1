'use client';

import { OrviloDetailProvider } from './OrviloDetailProvider';
import SkillDetailInner from './SkillDetailInner';

export interface OrviloSkillDetailContentProps {
  identifier: string;
}

export const OrviloSkillDetailContent = ({ identifier }: OrviloSkillDetailContentProps) => {
  return (
    <OrviloDetailProvider identifier={identifier}>
      <SkillDetailInner type="orvilo" />
    </OrviloDetailProvider>
  );
};
