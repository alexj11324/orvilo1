import nativeStyles from './styles.module.css';

export const styles = {
  container: `${nativeStyles.container} transition-[opacity,transform]`,
  dropdownMenu: nativeStyles.dropdownMenu,
  groupHeader: nativeStyles.groupHeader,
  menuItem: `${nativeStyles.menuItem} transition-[color,background-color,border-color,box-shadow]`,
  menuRow: `${nativeStyles.menuRow} transition-[color,background-color,border-color,box-shadow]`,
  menuGlyph: nativeStyles.menuGlyph,
  caption: nativeStyles.caption,
  groupCaption: nativeStyles.groupCaption,
  tertiaryText: nativeStyles.tertiaryText,
  settingsAction: nativeStyles.settingsAction,
  toolbarSearch: nativeStyles.toolbarSearch,
  toolbarTabs: nativeStyles.toolbarTabs,
  toolbarTabList: nativeStyles.toolbarTabList,
  toolbarTab: `${nativeStyles.toolbarTab} transition-[color,transform]`,
  menuItemActive: nativeStyles.menuItemActive,
  footer: nativeStyles.footer,
  toolbar: nativeStyles.toolbar,
  detailPopup: `${nativeStyles.detailPopup} w-100 select-none overscroll-contain transition-[opacity,transform]`,
  empty:
    'flex min-h-24 items-center justify-center px-4 py-6 text-sm leading-5.5 text-muted-foreground text-center',
  list: 'relative w-full overflow-x-hidden overflow-y-auto overscroll-contain',
  trigger: 'inline-flex outline-none [&_svg:focus]:outline-none',
};
