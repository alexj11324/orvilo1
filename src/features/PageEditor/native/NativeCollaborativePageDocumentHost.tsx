'use client';

import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import EditingIndicator from '@/features/EditLock/EditingIndicator';

import { NativePageDocumentHost, type NativePageDocumentHostProps } from './NativePageDocumentHost';
import { useNativePageCollaboration } from './useNativePageCollaboration';
import { useNativePageDraft } from './useNativePageDraft';

export type NativeCollaborativePageDocumentHostProps = Omit<
  NativePageDocumentHostProps,
  'editable' | 'lockOwnerId'
>;

/** Explicit full document-lifecycle atom; callers still supply all widgets and
 * own their chrome/metadata/Runtime. The default SDK PageEditor is unchanged. */
export function NativeCollaborativePageDocumentHost(
  props: NativeCollaborativePageDocumentHostProps,
) {
  return <NativeCollaborativeSession key={props.documentId} {...props} />;
}

function NativeCollaborativeSession({
  documentId,
  header,
  onInit,
  ...props
}: NativeCollaborativePageDocumentHostProps) {
  const { t } = useTranslation('file');
  const session = useNativePageCollaboration(documentId);
  const [editor, setEditor] = useState<NativeIEditorKernel>();
  useNativePageDraft({
    documentId,
    editor,
    health: session.lock.health,
    ownerId: session.lockOwnerId,
    editable: session.editable && !props.disabled,
  });
  return (
    <NativePageDocumentHost
      {...props}
      documentId={documentId}
      editable={session.editable}
      lockOwnerId={session.lockOwnerId}
      header={
        <>
          {header}
          {session.collaborative && (
            <EditingIndicator
              holderId={session.lock.lockedByOther ? session.lock.holderId : undefined}
              pending={session.lock.pending}
            />
          )}
          {session.collaborative &&
            !session.lock.lockedByOther &&
            session.lock.health !== 'healthy' && (
              <Alert variant={session.lock.health === 'lost' ? 'warning' : 'info'}>
                <AlertTitle>
                  {t(
                    session.lock.health === 'lost'
                      ? 'pageEditor.editMode.lockLostTitle'
                      : 'pageEditor.editMode.lockUnstable',
                  )}
                </AlertTitle>
                {session.lock.health === 'lost' && (
                  <AlertDescription>
                    {t('pageEditor.editMode.lockLostDescription')}
                  </AlertDescription>
                )}
              </Alert>
            )}
        </>
      }
      onInit={(kernel) => {
        setEditor(kernel);
        onInit?.(kernel);
      }}
    />
  );
}
