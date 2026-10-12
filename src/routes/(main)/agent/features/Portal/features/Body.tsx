'use client';

import { cn } from 'cn';
import { type PropsWithChildren } from 'react';

// Keep the original descendant selector: only descendants containing an artifact
// receive the clipping and bottom inset, not every portal body.
const body =
  'relative w-full h-0 flex-1 [&_:has(.portal-artifact)]:overflow-hidden [&_:has(.portal-artifact)]:pbe-3';

const Body = ({ children }: PropsWithChildren) => (
  <div className={cn('flex flex-col', `${body} portal-body`)}>{children}</div>
);

export default Body;
