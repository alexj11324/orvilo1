import { isDesktop } from '@orvilo/const';

// Application overlay policy for the actual ant prefix configured by AppTheme.
// Native document rules stay unlayered; current vendor declarations are layered
// and ordinary, so the mask policy requires no important override.
const desktopMask = isDesktop
  ? `
  .ant-modal-mask.ant-modal-mask-blur {
    background: rgb(from var(--background) r g b / 0.8);
    backdrop-filter: none;
  }
`
  : '';

const antdOverride = `
  .ant-popover {
    z-index: 1100;
  }

  .ant-menu-item-selected .ant-menu-title-content {
    color: var(--foreground);
  }

  .ant-modal-mask, .ant-drawer-mask {
    background: rgb(from var(--background) r g b / 0.5);
    backdrop-filter: blur(2px);
  }
  ${desktopMask}
`;

export default antdOverride;
