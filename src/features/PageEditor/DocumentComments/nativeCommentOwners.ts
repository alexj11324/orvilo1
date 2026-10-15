import type { NativeIPlugin } from '@orvilo/editor-runtime/native-browser';
import { createContext } from 'react';

import type { NativeFileOwner } from '@/components/NativePageEditor/file';
import type { createNativeImageOwner } from '@/components/NativePageEditor/image';
import type { NativeEditorWidgets } from '@/components/NativePageEditor/session';

interface NativeCommentOwners {
  fileOwner: NativeFileOwner;
  imageOwner: ReturnType<typeof createNativeImageOwner>;
  plugins: NativeIPlugin[];
  publishedImageOwner: ReturnType<typeof createNativeImageOwner>;
  widgets: NativeEditorWidgets;
}
export const NativeCommentOwnersContext = createContext<NativeCommentOwners | null>(null);
