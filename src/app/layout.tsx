import './globals.css';

import { SpeedInsights } from '@vercel/speed-insights/next';
import { Geist } from 'next/font/google';
import { type ReactNode, Suspense } from 'react';

import Analytics from '@/components/Analytics';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const inVercel = process.env.VERCEL === '1';

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html
      suppressHydrationWarning
      className={cn('font-sans', geist.variable)}
      lang={'en'}
      style={{ height: '100%' }}
    >
      <body style={{ height: '100%', margin: 0 }}>
        {children}
        <Suspense fallback={null}>
          <Analytics />
          {inVercel && <SpeedInsights />}
        </Suspense>
      </body>
    </html>
  );
};

export default RootLayout;
