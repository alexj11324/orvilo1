import { cssVar } from 'antd-style';
import { memo } from 'react';

import OllamaSetupGuide from '@/components/OllamaSetupGuide';
import { isDesktop } from '@/const/version';

import OllamaDesktopSetupGuide from './Desktop';

const SetupGuide = memo<{ id?: string }>(({ id }) => {
  return (
    <div
      className="flex flex-col items-center gap-2 p-4"
      style={{
        border: `1px solid ${cssVar.colorBorder}`,
        borderRadius: cssVar.borderRadiusLG,

        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      {isDesktop ? <OllamaDesktopSetupGuide id={id} /> : <OllamaSetupGuide />}
    </div>
  );
});

export default SetupGuide;
