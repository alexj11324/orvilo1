import { cssVar } from 'antd-style';
import { ChevronRight, GlobeIcon } from 'lucide-react';
import { memo, type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { localeOptions } from '@/locales/resources';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';
import { electronStylish } from '@/styles/electron';
import { preloadLang } from '@/utils/client/preloadLang';

import { getLanguageDisplayLabel } from './getLanguageDisplayLabel';

type LangPlacement = 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';

interface LangMenuItem {
  checked: boolean;
  closeOnClick?: boolean;
  key: string;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
  type?: 'checkbox';
}

const LangButton = memo<{ compact?: boolean; placement?: LangPlacement }>(
  ({ compact, placement }) => {
    const [language, currentLanguage, switchLocale] = useGlobalStore((s) => [
      globalGeneralSelectors.language(s),
      globalGeneralSelectors.currentLanguage(s),
      s.switchLocale,
    ]);

    const { t } = useTranslation(['setting', 'common']);
    const [open, setOpen] = useState(false);
    const currentLabel = getLanguageDisplayLabel(
      language,
      currentLanguage,
      t('settingCommon.lang.autoMode'),
    );

    const items = useMemo<LangMenuItem[]>(() => {
      const autoItem: LangMenuItem = {
        checked: language === 'auto',
        closeOnClick: true,
        key: 'auto',
        label: (
          <div className="flex flex-col gap-1" onMouseEnter={() => preloadLang('auto')}>
            <div style={{ lineHeight: 1.2 }}>{t('settingCommon.lang.autoMode')}</div>
            <div className="text-[12px] text-muted-foreground" style={{ lineHeight: 1.2 }}>
              {t(`lang.auto` as any, { ns: 'common' })}
            </div>
          </div>
        ),
        onCheckedChange: (checked: boolean) => {
          if (checked) {
            switchLocale('auto');
          }
        },
        type: 'checkbox',
      };

      const localeItems = localeOptions.map<LangMenuItem>((item) => ({
        checked: language === item.value,
        closeOnClick: true,
        key: item.value,
        label: (
          <div
            className="flex flex-col gap-1"
            key={item.value}
            onMouseEnter={() => preloadLang(item.value)}
          >
            <div style={{ lineHeight: 1.2 }}>{item.label}</div>
            <div className="text-[12px] text-muted-foreground" style={{ lineHeight: 1.2 }}>
              {t(`lang.${item.value}` as any, { ns: 'common' })}
            </div>
          </div>
        ),
        onCheckedChange: (checked: boolean) => {
          if (checked) {
            switchLocale(item.value);
          }
        },
        type: 'checkbox',
      }));

      return [autoItem, ...localeItems];
    }, [language, switchLocale, t]);

    let trigger: ReactNode;

    if (compact) {
      trigger = (
        <Button
          size="sm"
          variant="ghost"
          style={{
            height: 32,
            paddingInline: 8,
          }}
        >
          <span style={{ fontSize: 12 }}>{currentLabel}</span> <GlobeIcon data-icon="inline-end" />
        </Button>
      );
    } else {
      trigger = (
        <div
          className="flex items-center gap-3"
          style={{
            borderRadius: 8,
            boxSizing: 'content-box',
            cursor: 'pointer',
            height: 28,
            marginInline: 4,
            paddingBlock: 6,
            paddingInline: 12,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = cssVar.colorFillTertiary as string;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <div className="flex flex-col flex-1">{currentLabel}</div>
          <GlobeIcon size={'small'} style={{ color: cssVar.colorTextSecondary }} />
          <ChevronRight size={'small'} style={{ color: cssVar.colorTextSecondary }} />
        </div>
      );
    }

    return (
      <div onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger render={trigger as ReactElement} />
          <DropdownMenuContent
            className={electronStylish.nodrag}
            align={
              placement?.endsWith('Right')
                ? 'end'
                : placement?.endsWith('Left')
                  ? 'start'
                  : 'center'
            }
            side={
              placement?.startsWith('top')
                ? 'top'
                : placement?.startsWith('left')
                  ? 'left'
                  : placement?.startsWith('right')
                    ? 'right'
                    : 'bottom'
            }
            style={{
              maxHeight: 360,
              minWidth: 240,
              overflow: 'auto',
              transition: 'none',
            }}
          >
            {items.map((item) => (
              <DropdownMenuCheckboxItem
                checked={item.checked}
                closeOnClick={item.closeOnClick}
                key={item.key}
                onCheckedChange={item.onCheckedChange}
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  },
);

export default LangButton;
