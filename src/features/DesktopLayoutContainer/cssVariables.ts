import { isDesktop } from '@/const/version';
import { getDarwinMajorVersion, isMacOSWithLargeWindowBorders } from '@/utils/platform';

export const getOuterCssVariables = ({ expand }: { expand?: boolean }): Record<string, string> => ({
  '--container-padding-left': expand ? '0px' : '8px',
  '--container-padding-top': isDesktop ? '0px' : '8px',
});

export const getInnerCssVariables = ({ isDark }: { isDark: boolean }): Record<string, string> => {
  const darwinMajorVersion = getDarwinMajorVersion();

  const borderRadius = darwinMajorVersion >= 25 ? '12px' : 'var(--ant-border-radius)';
  const borderBottomRightRadius =
    darwinMajorVersion >= 26 || isMacOSWithLargeWindowBorders() ? '12px' : borderRadius;

  return {
    '--container-border-bottom-right-radius': borderBottomRightRadius,
    '--container-border-color': isDark
      ? 'var(--ant-color-border-secondary)'
      : 'var(--ant-color-border)',
    '--container-border-radius': borderRadius,
  };
};
