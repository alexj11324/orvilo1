type Padding = number | Partial<Record<'bottom' | 'left' | 'right' | 'top', number>>;

let collisionPadding: Padding | undefined;

/** Keeps app-level floating layers (e.g. the web context menu) clear of reserved chrome. */
export const setFloatingCollisionPadding = (padding: Padding | undefined) => {
  collisionPadding = padding;
};

export const getFloatingCollisionPadding = (): Padding | undefined => collisionPadding;
