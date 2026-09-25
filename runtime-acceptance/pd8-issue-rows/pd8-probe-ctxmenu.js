// close any open dropdown first
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await new Promise((r) => setTimeout(r, 300));

const status = document.querySelector('span[data-collab-id$=":status"]');
const block = status.closest('div[data-collab-id^="task:"]');
const r = block.getBoundingClientRect();
const cx = Math.round(r.x + r.width / 2),
  cy = Math.round(r.y + r.height / 2);
for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'contextmenu']) {
  const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
  block.dispatchEvent(
    new Ctor(type, { bubbles: true, cancelable: true, button: 2, clientX: cx, clientY: cy }),
  );
}
await new Promise((r) => setTimeout(r, 600));

const menuNodes = [
  ...document.querySelectorAll(
    '.ant-dropdown-menu-item, [role="menuitem"], [role="menu"] li, .ant-menu li',
  ),
];
const texts = menuNodes
  .map((i) => (i.textContent || '').trim().replaceAll(/\s+/g, ' '))
  .filter(Boolean);
return {
  url: location.href,
  menuItemTexts: texts,
  hasPriorityEntry: texts.some((t) => /priority|优先/i.test(t)),
};
