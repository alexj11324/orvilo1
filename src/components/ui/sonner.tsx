'use client';

import { cn } from 'cn';
import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

import styles from './sonner.module.css';

function Toaster({ className, ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();

  return (
    <SonnerToaster
      className={cn(styles.host, className)}
      theme={theme as ToasterProps['theme']}
      {...props}
    />
  );
}

export { Toaster };
