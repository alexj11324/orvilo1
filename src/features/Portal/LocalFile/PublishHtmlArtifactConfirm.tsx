import { t } from 'i18next';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { ReadyWorkspaceHtmlPublishPlan } from './prepareWorkspaceHtmlPublish';
import { WORKSPACE_HTML_ARTIFACT_INLINE_MAX_BYTES } from './readWorkspaceAsset';

const CONFIRM_BODY_MAX_HEIGHT = 'min(52vh, 360px)';

const PathList = ({ items }: { items: string[] }) => (
  <div className="flex flex-col gap-1">
    {items.map((item) => (
      <div className="text-muted-foreground" key={item} style={{ wordBreak: 'break-all' }}>
        {item}
      </div>
    ))}
  </div>
);

interface PublishHtmlArtifactConfirmContentProps {
  inlinedPaths: string[];
  inlineLimit: string;
  missing: string[];
  oversized: string[];
  remotes: string[];
  unsupported: string[];
  uploadedPaths: string[];
}

const PublishHtmlArtifactConfirmContent = ({
  inlineLimit,
  inlinedPaths,
  missing,
  oversized,
  remotes,
  unsupported,
  uploadedPaths,
}: PublishHtmlArtifactConfirmContentProps) => {
  const { t } = useTranslation('chat');
  const showDetails = [inlinedPaths, uploadedPaths, missing, oversized, remotes, unsupported].some(
    (list) => list.length > 0,
  );

  return (
    <ScrollArea
      style={{ maxHeight: CONFIRM_BODY_MAX_HEIGHT, overflow: 'hidden' }}
      viewportProps={{ style: { height: 'auto', maxHeight: CONFIRM_BODY_MAX_HEIGHT } }}
    >
      <div className="flex flex-col gap-2" style={{ paddingBlock: 12, paddingInline: 16 }}>
        <div>{t('workingPanel.localFile.publish.privacy')}</div>
        {showDetails && (
          <Accordion>
            <AccordionItem className="border-b-0" value="details">
              <AccordionTrigger>
                <div className="text-[12px] text-muted-foreground font-medium">
                  {t('workingPanel.localFile.publish.details')}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2" style={{ paddingBlock: '4px 0' }}>
                  {inlinedPaths.length > 0 && (
                    <>
                      <div>
                        {t('workingPanel.localFile.publish.inline', {
                          count: inlinedPaths.length,
                          limit: inlineLimit,
                        })}
                      </div>
                      <PathList items={inlinedPaths} />
                    </>
                  )}
                  {uploadedPaths.length > 0 && (
                    <>
                      <div>
                        {t('workingPanel.localFile.publish.upload', {
                          count: uploadedPaths.length,
                        })}
                      </div>
                      <PathList items={uploadedPaths} />
                    </>
                  )}
                  {missing.length > 0 && (
                    <div className="text-muted-foreground">
                      {t('workingPanel.localFile.publish.missing', { list: missing.join(', ') })}
                    </div>
                  )}
                  {oversized.length > 0 && (
                    <div className="text-muted-foreground">
                      {t('workingPanel.localFile.publish.oversized', {
                        list: oversized.join(', '),
                      })}
                    </div>
                  )}
                  {unsupported.length > 0 && (
                    <div className="text-muted-foreground">
                      {t('workingPanel.localFile.publish.unsupported', {
                        list: unsupported.join(', '),
                      })}
                    </div>
                  )}
                  {remotes.length > 0 && (
                    <>
                      <div>{t('workingPanel.localFile.publish.remotes')}</div>
                      <PathList items={remotes} />
                    </>
                  )}
                  <div className="text-muted-foreground">
                    {t('workingPanel.localFile.publish.dynamic')}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        <div className="text-muted-foreground">{t('workingPanel.localFile.publish.note')}</div>
      </div>
    </ScrollArea>
  );
};

const PublishHtmlArtifactConfirmFooter = ({
  okText,
  onOk,
}: {
  okText: string;
  onOk: () => void;
}) => {
  const { t } = useTranslation('common');
  const { close } = useModalContext();

  return (
    <div
      className="flex flex-row gap-2 justify-end"
      style={{ paddingBlock: 12, paddingInline: 16 }}
    >
      <Button
        variant="outline"
        onClick={() => {
          close();
        }}
      >
        {t('cancel')}
      </Button>
      <Button
        variant="default"
        onClick={() => {
          close();
          onOk();
        }}
      >
        {okText}
      </Button>
    </div>
  );
};

export const openWorkspaceHtmlPublishConfirm = ({
  hasExisting,
  onOk,
  plan,
}: {
  hasExisting: boolean;
  onOk: () => void;
  plan: ReadyWorkspaceHtmlPublishPlan;
}) => {
  const okText = t(
    hasExisting
      ? 'workingPanel.localFile.publish.version'
      : 'workingPanel.localFile.publish.action',
    { ns: 'chat' },
  );

  createModal({
    content: (
      <PublishHtmlArtifactConfirmContent
        inlineLimit={`${WORKSPACE_HTML_ARTIFACT_INLINE_MAX_BYTES / 1024} KB`}
        inlinedPaths={plan.packed.inlinedPaths}
        missing={plan.gathered.missing}
        oversized={plan.gathered.oversized}
        remotes={plan.gathered.remotes}
        unsupported={plan.gathered.unsupported}
        uploadedPaths={plan.packed.sidecars.map((file) => file.path)}
      />
    ),
    footer: <PublishHtmlArtifactConfirmFooter okText={okText} onOk={onOk} />,
    styles: {
      content: { minHeight: 0, overflow: 'hidden', padding: 0 },
    },
    title: t('workingPanel.localFile.publish.confirmTitle', { ns: 'chat' }),
    width: 420,
  });
};
