import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@orvilo/ui';

export const Open = () => (
  <TooltipProvider>
    <div style={{ padding: '48px 80px' }}>
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="outline">Archive</Button>} />
        <TooltipContent>Move to archive (E)</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);
