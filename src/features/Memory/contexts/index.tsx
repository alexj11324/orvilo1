import LegacyMemoryPage from '@/features/Memory/legacy';
import { LayersEnum } from '@/types/userMemory';

export default function Page() {
  return <LegacyMemoryPage layer={LayersEnum.Context} />;
}
