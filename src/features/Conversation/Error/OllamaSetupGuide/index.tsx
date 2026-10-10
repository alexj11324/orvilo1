import { memo } from 'react';

import OllamaSetupGuide from '@/components/OllamaSetupGuide';
import { isDesktop } from '@/const/version';

import OllamaDesktopSetupGuide from './Desktop';

const SetupGuide = memo<{ id?: string }>(({ id }) => {
  return (
    <div className="relative flex w-full flex-col items-center gap-2 overflow-hidden rounded-(--ant-border-radius-lg) border border-border p-4">
      {isDesktop ? <OllamaDesktopSetupGuide id={id} /> : <OllamaSetupGuide />}
    </div>
  );
});

export default SetupGuide;
