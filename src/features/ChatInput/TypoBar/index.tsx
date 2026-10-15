import { memo } from 'react';

import { NativeRichToolbar } from '@/components/NativePageEditor/richToolbar';
import { TypoBar as EditorTypoBar } from '@/features/EditorCanvas/TypoBar';

import { useChatInputStore } from '../store';

const TypoBar = memo(() => {
  const editor = useChatInputStore((s) => s.editor);
  const native = useChatInputStore((s) => s.nativeComposer);

  return native ? <NativeRichToolbar editor={native} /> : <EditorTypoBar editor={editor} />;
});

TypoBar.displayName = 'TypoBar';

export default TypoBar;
