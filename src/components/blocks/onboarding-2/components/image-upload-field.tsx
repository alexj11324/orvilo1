'use client';

import { UserCircle } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useFileUpload } from '@/hooks/use-file-upload';

interface ImageUploadFieldProps {
  alt?: string;
  defaultImage?: string;
  description?: string;
  inputId?: string;
  replaceLabel?: string;
  uploadLabel?: string;
}

export function ImageUploadField({
  inputId,
  defaultImage,
  alt = 'Uploaded image',
  description,
  uploadLabel = 'Upload photo',
  replaceLabel = 'Replace photo',
}: ImageUploadFieldProps) {
  const [{ files }, { removeFile, openFileDialog, getInputProps }] = useFileUpload({
    accept: 'image/*',
  });

  const currentFile = files[0] ?? null;
  const previewUrl = currentFile?.preview ?? defaultImage ?? null;
  const fileName = currentFile?.file.name;
  const hasImage = Boolean(previewUrl);

  const handleCancelUpload = () => {
    if (!currentFile) {
      return;
    }

    removeFile(currentFile.id);
  };

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-12 border">
        {previewUrl ? <AvatarImage alt={fileName ?? alt} src={previewUrl} /> : null}
        <AvatarFallback className="bg-muted text-muted-foreground">
          <UserCircle aria-hidden="true" className="size-5 opacity-60" />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative inline-flex">
            <Button
              aria-haspopup="dialog"
              size="sm"
              type="button"
              variant="outline"
              onClick={openFileDialog}
            >
              {hasImage ? replaceLabel : uploadLabel}
            </Button>
            <input
              {...getInputProps({ id: inputId })}
              aria-hidden="true"
              className="hidden"
              tabIndex={-1}
            />
          </div>

          {currentFile ? (
            <Button
              className="text-muted-foreground hover:text-foreground"
              size="sm"
              type="button"
              variant="ghost"
              onClick={handleCancelUpload}
            >
              Cancel
            </Button>
          ) : null}
        </div>

        {description ? (
          <p className="text-muted-foreground text-xs leading-4">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
