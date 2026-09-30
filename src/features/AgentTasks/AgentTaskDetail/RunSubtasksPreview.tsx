import { Tag, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface SubtaskGraphPlan {
  alreadyDone: string[];
  blockedByCycle: string[];
  blockedExternally: string[];
  cycles: string[];
  ineligible: string[];
  layers: string[][];
  totalRunnable: number;
}

interface Props {
  plan: SubtaskGraphPlan;
}

const RunSubtasksPreview = memo<Props>(({ plan }) => {
  const { t } = useTranslation('chat');

  return (
    <div className="flex flex-col gap-3" style={{ paddingBlock: 8 }}>
      <Text fontSize={13} style={{ color: cssVar.colorTextSecondary }}>
        {t('taskDetail.runAll.description')}
      </Text>

      <div className="flex flex-col gap-2">
        {plan.layers.map((layer, index) => {
          const hint =
            index === 0
              ? t('taskDetail.runAll.layerHint.first')
              : t('taskDetail.runAll.layerHint.next', { prev: index });
          return (
            <div
              className="flex flex-col gap-1.5 rounded-md border border-border"
              key={`layer-${index}`}
              style={{ paddingBlock: 8, paddingInline: 12 }}
            >
              <div className="flex items-center justify-between gap-2">
                <Text fontSize={13} weight={600}>
                  {t('taskDetail.runAll.layer', { index: index + 1 })}
                </Text>
                <Text fontSize={12} style={{ color: cssVar.colorTextDescription }}>
                  {hint}
                </Text>
              </div>
              <div className="flex flex-wrap gap-1">
                {layer.map((id) => (
                  <Tag key={id} style={{ marginInlineEnd: 0 }}>
                    {id}
                  </Tag>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {(plan.alreadyDone.length > 0 ||
        plan.ineligible.length > 0 ||
        plan.blockedExternally.length > 0) && (
        <div className="flex flex-col gap-1">
          {plan.alreadyDone.length > 0 && (
            <Text fontSize={12} style={{ color: cssVar.colorTextDescription }}>
              {t('taskDetail.runAll.skipped.alreadyDone', { count: plan.alreadyDone.length })}
            </Text>
          )}
          {plan.ineligible.length > 0 && (
            <Text fontSize={12} style={{ color: cssVar.colorTextDescription }}>
              {t('taskDetail.runAll.skipped.ineligible', { count: plan.ineligible.length })}
            </Text>
          )}
          {plan.blockedExternally.length > 0 && (
            <Text fontSize={12} style={{ color: cssVar.colorTextDescription }}>
              {t('taskDetail.runAll.skipped.blockedExternally', {
                count: plan.blockedExternally.length,
              })}
            </Text>
          )}
        </div>
      )}

      {plan.cycles.length > 0 && (
        <div
          className="rounded-md border border-border"
          style={{ paddingBlock: 8, paddingInline: 12 }}
        >
          <Text fontSize={12} style={{ color: cssVar.colorWarning }}>
            {t('taskDetail.runAll.cycleWarning', {
              members: [...plan.cycles, ...plan.blockedByCycle].join(', '),
            })}
          </Text>
        </div>
      )}
    </div>
  );
});

RunSubtasksPreview.displayName = 'RunSubtasksPreview';

export default RunSubtasksPreview;
