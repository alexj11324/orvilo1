'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
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

const styles = createStaticStyles(({ css }) => ({
  anchorCard: css`
    overflow: hidden;
  `,
  anchorContent: css`
    padding-block: 8px 16px;
    padding-inline: 16px;
  `,
  anchorHeader: css`
    &:hover {
      background: transparent;
    }
  `,
  canonCard: css`
    display: flex;
    flex-direction: column;
    gap: 6px;

    min-width: 0;
    padding-block: 12px;
    padding-inline: 14px;
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorFillQuaternary};
  `,
  definition: css`
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 10px 24px;
    align-items: baseline;
  `,
  definitionLabel: css`
    display: inline-flex;
    gap: 6px;
    align-items: center;
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  `,
  layerCell: css`
    display: flex;
    flex-direction: column;
    gap: 4px;

    min-width: 0;
    padding-inline-start: 12px;
    border-inline-start: 2px solid ${cssVar.colorBorderSecondary};
  `,
  layerIndex: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextQuaternary};
    letter-spacing: 0.04em;
  `,
  sectionLabel: css`
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    letter-spacing: 0.02em;
  `,
}));

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
      <AnchorIcon color={cssVar.colorTextTertiary} size={15} />
      <div className="font-semibold">{t('anchor.title')}</div>
      <div className="text-[12px] text-muted-foreground">{t('anchor.subtitle')}</div>
    </div>
  );

  return (
    <div
      className={cx(styles.anchorCard, 'flex flex-col border')}
      style={{ borderColor: cssVar.colorBorderSecondary, background: cssVar.colorBgContainer }}
    >
      <Accordion defaultValue={['anchor']}>
        {[
          {
            key: 'anchor',
            title,
            children: (
              <div className={cx(styles.anchorContent, 'flex flex-col gap-6')}>
                {(domainFilter || outOfScope) && (
                  <div className={styles.definition}>
                    {domainFilter && (
                      <>
                        <div
                          className={cn('text-muted-foreground', styles.definitionLabel)}
                          style={{ fontSize: 12.5 }}
                        >
                          <CircleCheckIcon color={cssVar.colorSuccess} size={13} />
                          {t('anchor.filter')}
                        </div>
                        <div className="text-[13px]" style={{ lineHeight: 1.7 }}>
                          {domainFilter}
                        </div>
                      </>
                    )}
                    {outOfScope && (
                      <>
                        <div
                          className={cn('text-muted-foreground', styles.definitionLabel)}
                          style={{ fontSize: 12.5 }}
                        >
                          <CircleXIcon color={cssVar.colorTextTertiary} size={13} />
                          {t('anchor.outOfScope')}
                        </div>
                        <div
                          className="text-[13px] text-muted-foreground"
                          style={{ lineHeight: 1.7 }}
                        >
                          {outOfScope}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className={styles.sectionLabel}>{t('create.anchor.canon')}</span>
                    <div className="text-[12px] text-muted-foreground">
                      {domain.canonEntries.length > 0
                        ? t('create.anchor.canonHint')
                        : t('anchor.noCanon')}
                    </div>
                  </div>
                  {domain.canonEntries.length > 0 && (
                    <div className={styles.grid}>
                      {domain.canonEntries.map((c) => (
                        <div className={styles.canonCard} key={c.key}>
                          <div className="font-semibold" style={{ fontSize: 13.5 }}>
                            {c.title}
                          </div>
                          <div
                            className="text-muted-foreground"
                            style={{ fontSize: 12.5, lineHeight: 1.65 }}
                          >
                            {c.statement}
                          </div>
                          <div
                            className="truncate min-w-0 text-muted-foreground"
                            style={{ fontSize: 11.5, opacity: 0.75 }}
                          >
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
                    <div className="text-[12px] text-muted-foreground">
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
                          <div className="font-semibold" style={{ fontSize: 13.5 }}>
                            {l.title}
                          </div>
                          {l.description && (
                            <div
                              className="text-muted-foreground"
                              style={{ fontSize: 12.5, lineHeight: 1.6 }}
                            >
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
              <AccordionTrigger>{item.title}</AccordionTrigger>
              <AccordionContent>{item.children}</AccordionContent>
            </AccordionItem>
          ))}
      </Accordion>
    </div>
  );
});

AnchorCard.displayName = 'ExpertiseAnchorCard';

export default AnchorCard;
