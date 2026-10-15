export interface ExistingEditorAttachment {
  fileId: string;
  fileType: string;
  name: string;
  size: number;
  url: string;
}

export const existingAttachmentByFile = new WeakMap<File, ExistingEditorAttachment>();

export const getExistingEditorAttachment = (file: File): ExistingEditorAttachment | undefined =>
  existingAttachmentByFile.get(file);
