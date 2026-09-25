await new Promise((r) => setTimeout(r, 500));
const items = [
  ...document.querySelectorAll('.ant-dropdown-menu-item, [role="menuitem"], .ant-dropdown-menu li'),
];
const menus = [...document.querySelectorAll('.ant-dropdown, .ant-dropdown-menu')];
return {
  visibleDropdowns: menus.filter(
    (m) => m.offsetParent !== null || m.getBoundingClientRect().width > 0,
  ).length,
  menuItemTexts: items
    .map((i) => (i.textContent || '').trim().replaceAll(/\s+/g, ' '))
    .filter(Boolean),
};
