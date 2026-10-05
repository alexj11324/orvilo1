'use client';

import { type ComponentProps, memo } from 'react';

import CustomLogo from './Custom';

export const ProductLogo = memo<ComponentProps<typeof CustomLogo>>((props) => (
  <CustomLogo {...props} />
));
