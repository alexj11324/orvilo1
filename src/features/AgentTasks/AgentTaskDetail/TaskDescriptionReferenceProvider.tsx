import type { IEditor } from '@lobehub/editor';
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { insertDescriptionReference } from '@/features/EditorCanvas/descriptionReferences/actions';

interface DescriptionEditorBinding {
  appOrigin: string;
  editable: boolean;
  editor: IEditor;
  taskId?: string;
}

interface DescriptionReferenceContextValue {
  binding: RefObject<DescriptionEditorBinding | null>;
  canInsert: boolean;
  register: (binding: DescriptionEditorBinding) => () => void;
  taskId?: string;
}

const DescriptionReferenceContext = createContext<DescriptionReferenceContextValue | null>(null);

/** Each routed/portal host owns its description editor and edit-lock boundary. */
export const TaskDescriptionReferenceProvider = ({
  children,
  taskId,
}: {
  children: ReactNode;
  taskId?: string;
}) => {
  const binding = useRef<DescriptionEditorBinding | null>(null);
  const [canInsert, setCanInsert] = useState(false);
  const register = useCallback((value: DescriptionEditorBinding) => {
    binding.current = value;
    setCanInsert(value.editable);
    return () => {
      if (binding.current !== value) return;
      binding.current = null;
      setCanInsert(false);
    };
  }, []);
  const value = useMemo(
    () => ({ binding, canInsert, register, taskId }),
    [canInsert, register, taskId],
  );
  return <DescriptionReferenceContext value={value}>{children}</DescriptionReferenceContext>;
};

export const useRegisterTaskDescriptionEditor = (
  editor: IEditor | undefined,
  editable: boolean,
  appOrigin: string,
) => {
  const context = use(DescriptionReferenceContext);
  const register = context?.register;
  const taskId = context?.taskId;
  useLayoutEffect(() => {
    if (editor && register) return register({ appOrigin, editable, editor, taskId });
  }, [appOrigin, editable, editor, register, taskId]);
};

export const useTaskDescriptionReferenceActions = () => {
  const context = use(DescriptionReferenceContext);
  const insertReference = useCallback(
    (url: string) => {
      // An async picker may resolve after rights changed or this editor unmounted.
      const current = context?.binding.current;
      if (!current?.editable || current.taskId !== context?.taskId) return false;
      return insertDescriptionReference(current.editor, url, current.appOrigin);
    },
    [context?.binding, context?.taskId],
  );
  return { canInsert: context?.canInsert ?? false, insertReference };
};
