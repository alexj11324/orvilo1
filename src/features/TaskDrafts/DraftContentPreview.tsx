import RichTextMessage from '@/features/Conversation/Messages/User/components/RichTextMessage';

import { draftPreviewDocument } from './draftPreviewDocument';

interface DraftContentPreviewProps {
  attachmentLabel: string;
  content: string;
  editorData: unknown;
}

const DraftContentPreview = ({
  attachmentLabel,
  content,
  editorData,
}: DraftContentPreviewProps) => {
  const document = draftPreviewDocument(editorData);
  return document ? <RichTextMessage editorState={document} /> : <>{content || attachmentLabel}</>;
};

export default DraftContentPreview;
