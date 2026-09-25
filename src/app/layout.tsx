import './globals.css';

import { SpeedInsights } from '@vercel/speed-insights/next';
import { Inter } from 'next/font/google';
import { type ReactNode, Suspense } from 'react';

import Analytics from '@/components/Analytics';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const inVercel = process.env.VERCEL === '1';

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html
      suppressHydrationWarning
      className={cn('font-sans', inter.variable)}
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
