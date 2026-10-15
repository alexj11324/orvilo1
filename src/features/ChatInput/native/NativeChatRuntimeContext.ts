'use client';

import { createContext } from 'react';

import type { NativeMathRenderer } from '@/components/NativePageEditor/math';

/** Missing renderer never opts a composer into native mode. */
export const NativeChatRuntimeContext = createContext<NativeMathRenderer | null>(null);
