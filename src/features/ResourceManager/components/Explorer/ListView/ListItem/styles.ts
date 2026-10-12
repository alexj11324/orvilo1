export const styles = {
  container:
    "cursor-pointer relative min-w-200 after:pointer-events-none after:content-[''] after:absolute after:z-0 after:inset-0 after:opacity-0 after:bg-accent after:transition-[opacity,background-color] after:duration-(--orvilo-motion-mid) after:ease-(--ant-motion-ease-in-out) [&>*]:relative [&>*]:z-1 hover:after:opacity-100",
  dragOver:
    'outline outline-1 outline-dashed outline-primary-border -outline-offset-2 before:opacity-0 after:opacity-100 after:bg-primary-wash hover:after:opacity-100 hover:after:bg-primary-wash',
  dragging: 'will-change-transform opacity-50',
  evenRow:
    "before:pointer-events-none before:content-[''] before:absolute before:z-0 before:inset-0 before:opacity-100 before:bg-fill-quaternary before:transition-opacity before:duration-(--orvilo-motion-mid) before:ease-(--ant-motion-ease-in-out) hover:before:opacity-0 [.list-view-drop-zone:hover_&]:before:opacity-0",
  hover: 'opacity-0 data-[popup-open]:opacity-100 [.file-list-item-group:hover_&]:opacity-100',
  item: 'py-0 ps-0 pe-6 text-muted-foreground',
  name: 'overflow-hidden flex-1 min-w-0 ms-3 text-sm leading-5.5 text-foreground whitespace-nowrap',
  nameContainer: 'overflow-hidden flex-1 min-w-0',
  selected: 'before:opacity-0 after:opacity-100 after:bg-selected hover:after:bg-selected',
};
