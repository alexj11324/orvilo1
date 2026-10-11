import { createStaticStyles } from 'antd-style';

const retainedSearchStyles = createStaticStyles(({ css }) => ({
  searchInput: css`
    flex: 1;

    height: 100%;
    border: 0 !important;
    border-radius: 0 !important;

    background: transparent !important;
    box-shadow: none !important;
  `,
}));

export const devDockPanelStyles = {
  flatSection: 'shrink-0 p-3 border-be border-divider',
  paneDividerEnd: 'border-e border-divider',
  paneDividerStart: 'border-s border-divider',
  paneHeader:
    'flex shrink-0 items-center h-9 px-3 border-be border-divider text-sm leading-5.5 font-semibold text-foreground',
  paneSearch: 'flex shrink-0 items-stretch h-11 border-be border-divider',
  root: 'overflow-hidden flex flex-col w-full h-full min-h-0',
  statusBar:
    'flex shrink-0 items-center justify-between h-7 px-3 border-bs border-divider font-mono text-xs leading-5 text-foreground-tertiary',
  toolbar: 'flex shrink-0 gap-2 items-center h-11 px-3 border-be border-divider',
  searchInput: retainedSearchStyles.searchInput,
};
