import type Avatar from './components/Avatar';
import type Combine from './components/Combine';
import type Mono from './components/Mono';
import type Text from './components/Text';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Combine: typeof Combine;
  Text: typeof Text;
  colorGpt3: string;
  colorGpt4: string;
  colorGpt5?: string;
  colorO1: string;
  colorO3: string;
  colorOss?: string;
  colorPlatform?: string;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
