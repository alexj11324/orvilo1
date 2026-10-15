import type Avatar from './components/Avatar';
import type BrandMono from './components/BrandMono';
import type Mono from './components/Mono';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Brand: typeof BrandMono;
  Text: typeof BrandMono;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
