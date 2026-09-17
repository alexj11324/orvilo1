import { type LobeHubProps } from '@lobehub/ui/brand';
import { LobeHub as Orvilo } from '@lobehub/ui/brand';
import { ORG_NAME } from '@orvilo/business-const';
import { memo } from 'react';

import { isCustomORG } from '@/const/version';

export const OrgBrand = memo<LobeHubProps>((props) => {
  if (isCustomORG) {
    return <span>{ORG_NAME}</span>;
  }

  return <Orvilo {...props} />;
});
