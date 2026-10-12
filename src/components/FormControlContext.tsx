'use client';

import { createContext, type ReactNode, use } from 'react';

interface FormControlContextValue {
  disabled?: boolean;
  size?: 'small' | 'middle' | 'large';
}

const FormControlContext = createContext<FormControlContextValue>({});

function FormControlProvider({
  children,
  disabled,
  size,
}: FormControlContextValue & { children?: ReactNode }) {
  const parent = use(FormControlContext);

  return (
    <FormControlContext
      value={{ disabled: disabled ?? parent.disabled, size: size ?? parent.size }}
    >
      {children}
    </FormControlContext>
  );
}

function useFormControlContext() {
  return use(FormControlContext);
}

export { FormControlProvider, useFormControlContext };
export type { FormControlContextValue };
