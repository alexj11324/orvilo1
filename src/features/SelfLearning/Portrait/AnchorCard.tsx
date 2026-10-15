'use client';

import { cn } from 'cn';
import { AnchorIcon, CircleCheckIcon, CircleXIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { ExpertiseDomainItem } from '@/services/expertise';

const styles = {
  anchorCard: 'overflow-hidden rounded-(--radius-card) border-divider bg-card',
  anchorContent: 'pt-2 pb-4 px-4',
  anchorHeader:
    'rounded-(--radius-button) text-start text-sm leading-5.5 transition-[color,background-color,border-color,box-shadow]',
  canonCard: 'flex flex-col gap-1.5 min-w-0 py-3 px-3.5 rounded-(--radius-card) bg-fill-quaternary',
  definition: 'grid grid-cols-[110px_minmax(0,1fr)] gap-y-2.5 gap-x-6 items-baseline',
  definitionLabel: 'inline-flex gap-1.5 items-center text-xs leading-5',
  grid: 'grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5',
  layerCell: 'flex flex-col gap-1 min-w-0 ps-3 border-s-2 border-divider',
  layerIndex: 'font-mono text-xs leading-5 text-muted-foreground tracking-[0.04em]',
  sectionLabel: 'text-xs leading-5 font-semibold text-muted-foreground tracking-[0.02em]',
};

/**
 * 它的锚 —— 这个方向拿什么标准在学：什么算实践、对照哪些经典原则、分成哪几层。
 * 建域时定下的东西，在详情里必须看得见；否则画像里的「层」和「覆盖」都无从解释。
 *
 * 排版：定义两行（标签列 + 正文）→ 经典依据卡片网格 → 分层横向条带。
 * 三块信息形态不同（句子 / 引文 / 层级），各用各的形状，不做成一列文字。
 */
const AnchorCard = memo<{ domain: ExpertiseDomainItem }>(({ domain }) => {
  const { t } = useTranslation('selfLearning');
  const canonRef =
    domain.layerSource === 'canonical' && domain.layerCanonRef ? domain.layerCanonRef : undefined;
  const domainFilter = domain.domainFilter.trim();
  const outOfScope = domain.outOfScope?.trim();
  const title = (
    <div className="flex items-center gap-2">
      <AnchorIcon className="size-4 text-foreground-tertiary" size={16} />
      <div className="text-sm leading-5.5 font-semibold">{t('anchor.title')}</div>
      <div className="text-xs text-muted-foreground">{t('anchor.subtitle')}</div>
    </div>
  );

  return (
    <div className={cn(styles.anchorCard, 'flex flex-col border')}>
      <Accordion defaultValue={['anchor']}>
        {[
          {
            key: 'anchor',
            title,
            children: (
              <div className={cn(styles.anchorContent, 'flex flex-col gap-6')}>
                {(domainFilter || outOfScope) && (
                  <div className={styles.definition}>
                    {domainFilter && (
                      <>
                        <div className={cn('text-muted-foreground', styles.definitionLabel)}>
                          <CircleCheckIcon className="size-4 text-success-text" size={16} />
                          {t('anchor.filter')}
                        </div>
                        <div className="text-sm leading-5.5">{domainFilter}</div>
                      </>
                    )}
                    {outOfScope && (
                      <>
                        <div className={cn('text-muted-foreground', styles.definitionLabel)}>
                          <CircleXIcon className="size-4 text-foreground-tertiary" size={16} />
                          {t('anchor.outOfScope')}
                        </div>
                        <div className="text-sm leading-5.5 text-muted-foreground">
                          {outOfScope}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className={styles.sectionLabel}>{t('create.anchor.canon')}</span>
                    <div className="text-xs text-muted-foreground">
                      {domain.canonEntries.length > 0
                        ? t('create.anchor.canonHint')
                        : t('anchor.noCanon')}
                    </div>
                  </div>
                  {domain.canonEntries.length > 0 && (
                    <div className={styles.grid}>
                      {domain.canonEntries.map((c) => (
                        <div className={styles.canonCard} key={c.key}>
                          <div className="text-sm leading-5.5 font-semibold">{c.title}</div>
                          <div className="text-sm leading-5.5 text-muted-foreground">
                            {c.statement}
                          </div>
                          <div className="truncate min-w-0 text-xs leading-5 text-muted-foreground">
                            — {c.source}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className={styles.sectionLabel}>{t('create.anchor.layers')}</span>
                    <div className="text-xs text-muted-foreground">
                      {domain.layers.length === 0
                        ? t('anchor.noLayers')
                        : canonRef
                          ? t('create.anchor.layersFrom', { ref: canonRef })
                          : t('create.anchor.layersInvented')}
                    </div>
                  </div>
                  {domain.layers.length > 0 && (
                    <div className={styles.grid}>
                      {domain.layers.map((l, i) => (
                        <div className={styles.layerCell} key={l.key}>
                          <span className={styles.layerIndex}>L{i + 1}</span>
                          <div className="text-sm leading-5.5 font-semibold">{l.title}</div>
                          {l.description && (
                            <div className="text-sm leading-5.5 text-muted-foreground">
                              {l.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          },
        ]
          .filter(Boolean)
          .map((item) => (
            <AccordionItem key={item.key} value={item.key}>
              <AccordionTrigger className={styles.anchorHeader}>{item.title}</AccordionTrigger>
              <AccordionContent>{item.children}</AccordionContent>
            </AccordionItem>
          ))}
      </Accordion>
    </div>
  );
});

AnchorCard.displayName = 'ExpertiseAnchorCard';

export default AnchorCard;
