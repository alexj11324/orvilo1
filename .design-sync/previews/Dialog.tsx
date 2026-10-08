import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@orvilo/ui';

// The dialog is a fixed-position portal; the spacer gives the card a real height.
export const Open = () => (
  <>
    <div style={{ height: 420 }} />
    <OpenDialog />
  </>
);

const OpenDialog = () => (
  <Dialog defaultOpen>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create project</DialogTitle>
        <DialogDescription>Projects group related issues and share a roadmap.</DialogDescription>
      </DialogHeader>
      <div style={{ display: 'grid', gap: 6 }}>
        <Label htmlFor="proj">Project name</Label>
        <Input id="proj" placeholder="e.g. Mobile onboarding" />
      </div>
      <DialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button>Create project</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
