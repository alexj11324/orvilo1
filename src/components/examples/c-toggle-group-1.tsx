import { BoldIcon, ItalicIcon, UnderlineIcon } from 'lucide-react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function Pattern() {
  return (
    <div className="flex items-center justify-center">
      <ToggleGroup multiple spacing={1}>
        <ToggleGroupItem aria-label="Toggle bold" value="bold">
          <BoldIcon />
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Toggle italic" value="italic">
          <ItalicIcon />
        </ToggleGroupItem>
        <ToggleGroupItem aria-label="Toggle underline" value="underline">
          <UnderlineIcon />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
