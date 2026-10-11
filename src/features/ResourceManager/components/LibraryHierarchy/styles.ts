export const styles = {
  dragging: 'will-change-transform opacity-50',
  fileItemDragOver:
    'outline outline-1 outline-dashed outline-primary-border -outline-offset-2 bg-primary-wash hover:bg-primary-wash',
  treeItem:
    'cursor-pointer [&_.hierarchy-node-actions]:opacity-0 [&_.hierarchy-node-actions]:transition-opacity [&_.hierarchy-node-actions]:duration-150 [&_.hierarchy-node-actions]:ease-[ease] hover:[&_.hierarchy-node-actions]:opacity-100 [&_.hierarchy-node-actions:focus-within]:opacity-100 [&_.hierarchy-node-actions[data-open=true]]:opacity-100',
};
