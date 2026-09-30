'use client';

import { Suspense } from 'react';

import Body from './Body';
import Header from './Header';

const SidebarContent = () => (
  <Suspense>
    <Header />
    <Body />
  </Suspense>
);

export default SidebarContent;
