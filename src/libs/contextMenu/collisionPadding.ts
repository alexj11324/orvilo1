export interface FloatingCollisionPadding {
  bottom?: number;
  left?: number;
  right?: number;
  top?: number;
}
let padding: FloatingCollisionPadding = {};
export const setFloatingCollisionPadding = (next: FloatingCollisionPadding) => {
  padding = { ...next };
};
export const getFloatingCollisionPadding = () => padding;
