import { userMemoryService } from '@/services/userMemory';
import { LayersEnum } from '@/types/userMemory';

/** Activity lists omit narrative; never overwrite it with the list summary. */
export async function loadMemoryEditValue(id: string, layer: LayersEnum, listContent: string) {
  if (layer !== LayersEnum.Activity) return listContent;
  const detail = await userMemoryService.getMemoryDetail({ id, layer });
  if (!detail || detail.layer !== LayersEnum.Activity) throw new Error('Activity unavailable');
  return detail.activity.narrative || '';
}
