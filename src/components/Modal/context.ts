'use client';

import { createContext, use } from 'react';

import type { ModalContextValue } from './types';

const ModalContext = createContext<ModalContextValue>({
  close: () => void 0,
  setCanDismissByClickOutside: () => void 0,
});

const useModalContext = (): ModalContextValue => use(ModalContext);

export { ModalContext, useModalContext };
