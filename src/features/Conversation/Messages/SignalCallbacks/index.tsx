'use client';
import { Markdown } from '@lobehub/ui';
import { type UISignalCallbacksBlock } from '@orvilo/types';
import { Radio } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const SignalCallbacks = memo<{ block: UISignalCallbacksBlock }>(({ block }) => {
  const { t } = useTranslation('chat');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  return (
    <Accordion multiple className="gap-1" value={expandedKeys} onValueChange={setExpandedKeys}>
      <AccordionItem value="signal-callbacks">
        <AccordionTrigger className="p-1 hover:no-underline">
          {
            <div className="flex items-center gap-2">
              <div className="flex size-6 flex-none items-center justify-center gap-1 rounded-full border border-border text-xs leading-5">
                <Radio className="text-muted-foreground" size={16} />
              </div>
              <span className="text-muted-foreground">
                {t('signalCallbacks.title', {
                  count: block.callbacks.length,
                  tool: block.sourceToolName,
                })}
              </span>
            </div>
          }
        </AccordionTrigger>
        <AccordionContent>
          {
            <div className="my-2 flex max-h-90 flex-col overflow-auto rounded-(--radius-card) border border-border p-3 text-sm leading-5.5">
              {block.callbacks.length === 0 ? (
                <div className="text-muted-foreground">{t('signalCallbacks.empty')}</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {block.callbacks.map((cb) => (
                    <div
                      className="flex items-start gap-2 border-be border-divider py-1 last:border-be-0"
                      key={cb.id}
                    >
                      {typeof cb.sequence === 'number' && (
                        <span className="min-w-5 flex-none text-xs leading-5 text-muted-foreground tabular-nums">
                          #{cb.sequence}
                        </span>
                      )}
                      <div className="flex flex-col flex-1">
                        <Markdown fontSize={14} lineHeight={22 / 14} variant="chat">
                          {cb.content}
                        </Markdown>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          }
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
});

SignalCallbacks.displayName = 'SignalCallbacks';

export default SignalCallbacks;
