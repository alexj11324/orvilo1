import { workspaceHtmlArtifactIdentifierForFile } from '@orvilo/html-artifact';
import { cssVar } from 'antd-style';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  type BlockedWorkspaceHtmlPublishInput,
  useBlockedWorkspaceHtmlPublish,
} from './useBlockedWorkspaceHtmlPublish';

const BODY_MAX_HEIGHT = 'min(52vh, 360px)';

export type OpenWorkspaceHtmlPublishBlockedConfirmInput = Omit<
  BlockedWorkspaceHtmlPublishInput,
  'close'
>;

const BlockedConfirmContent = (input: OpenWorkspaceHtmlPublishBlockedConfirmInput) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const { busy, cancel, failed, force, handleContinue, handleForceChange, resources } =
    useBlockedWorkspaceHtmlPublish({
      ...input,
      close,
    });
  const { filePath, plan, workingDirectory } = input;
  const identifier = workspaceHtmlArtifactIdentifierForFile(filePath, workingDirectory);
  const relativeTargetDirectory = `.orvilo-artifacts/${identifier}`;
  const failedPaths = new Set(failed.map((item) => item.absolutePath));
  return (
    <>
      <ScrollArea style={{ maxHeight: BODY_MAX_HEIGHT, overflow: 'hidden' }}>
        <div className="flex flex-col gap-3" style={{ paddingBlock: 12, paddingInline: 16 }}>
          <div>
            {t('workingPanel.localFile.publish.outsideWorkspace.description', {
              count: plan.escaped.length,
              ns: 'chat',
            })}
          </div>
          <div className="text-muted-foreground">
            {t('workingPanel.localFile.publish.outsideWorkspace.workspace', {
              ns: 'chat',
              path: workingDirectory,
            })}
          </div>
          {resources.some((item) => item.source) && (
            <div className="text-muted-foreground">
              {t('workingPanel.localFile.publish.outsideWorkspace.closureDescription', {
                ns: 'chat',
              })}
            </div>
          )}
          <Accordion>
            <AccordionItem className="border-b-0" value="details">
              <AccordionTrigger>
                <div className="text-[12px] text-muted-foreground font-medium">
                  {t('workingPanel.localFile.publish.details', { ns: 'chat' })}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2" style={{ paddingBlock: '4px 0' }}>
                  {resources.map((item) => (
                    <div className="flex flex-col gap-0.5" key={item.absolutePath}>
                      <div>{item.hrefs.join(', ')}</div>
                      {item.source && (
                        <div className="text-[12px] text-muted-foreground">
                          {t(
                            `workingPanel.localFile.publish.outsideWorkspace.source.${item.source}`,
                            { ns: 'chat' },
                          )}
                        </div>
                      )}
                      <div
                        className="text-muted-foreground"
                        style={{
                          color: failedPaths.has(item.absolutePath) ? cssVar.colorError : undefined,
                          fontFamily: cssVar.fontFamilyCode,
                          wordBreak: 'break-all',
                        }}
                      >
                        {item.absolutePath}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="text-muted-foreground">
            {t('workingPanel.localFile.publish.outsideWorkspace.copyHint', {
              count: resources.length,
              dir: relativeTargetDirectory,
              ns: 'chat',
            })}
          </div>
          {failed.length > 0 && (
            <div style={{ color: cssVar.colorError }}>
              {t('workingPanel.localFile.publish.outsideWorkspace.copyFailed', {
                list: failed.map((item) => item.absolutePath).join(', '),
                ns: 'chat',
              })}
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="flex flex-col" style={{ paddingBlock: '8px 4px', paddingInline: 16 }}>
        <div className="flex items-center gap-2">
          <Checkbox checked={force} onCheckedChange={handleForceChange} />
          <div className="text-[12px]">
            {t('workingPanel.localFile.publish.outsideWorkspace.forceLabel', { ns: 'chat' })}
          </div>
        </div>
      </div>
      <div
        className="flex flex-row gap-2 justify-end"
        style={{ paddingBlock: 12, paddingInline: 16 }}
      >
        <Button variant="outline" onClick={cancel}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button loading={busy} variant="default" onClick={() => void handleContinue()}>
          {busy && !force
            ? t('workingPanel.localFile.publish.outsideWorkspace.copying', { ns: 'chat' })
            : t(
                force
                  ? 'workingPanel.localFile.publish.outsideWorkspace.forceAction'
                  : 'workingPanel.localFile.publish.outsideWorkspace.copyAction',
                { ns: 'chat' },
              )}
        </Button>
      </div>
    </>
  );
};

export const openWorkspaceHtmlPublishBlockedConfirm = (
  input: OpenWorkspaceHtmlPublishBlockedConfirmInput,
) =>
  createModal({
    content: <BlockedConfirmContent {...input} />,
    footer: null,
    styles: { content: { minHeight: 0, overflow: 'hidden', padding: 0 } },
    title: t('workingPanel.localFile.publish.outsideWorkspace.title', { ns: 'chat' }),
    width: 420,
  });
