# Orvilo UI conventions

Orvilo UI is a **Tailwind v4 + Base UI** component set (ReUI / shadcn style). Components are real React exports on `window.OrviloUI`. There is no theme provider: design tokens are CSS variables on `:root`, shipped by `styles.css`. Do not wrap the page in a provider just for styling.

## Setup

- Load `styles.css` (it imports `_ds_bundle.css`). Without it every component renders unstyled.
- `Tooltip` must sit inside `TooltipProvider`. Toasts need one `Toaster` mounted once; `Sidebar*` parts need `SidebarProvider`.
- Overlays (`Dialog`, `Select`, `DropdownMenu`, `Popover`, `Sheet`) render in a portal. Use `defaultOpen` to show them open in a static design.
- `Select` shows the selected **label** only when the root gets `items={[{ value, label }]}`; otherwise it prints the raw value.
- Compound parts are separate exports: `Card` + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`; `Tabs` + `TabsList` / `TabsTrigger` / `TabsContent`; `Dialog` + `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter`. Read each `<Name>.d.ts` before using props.

## Styling idiom

Tailwind utility classes plus token variables. **`_ds_bundle.css` only contains utilities the components themselves use**, so a class you invent may not exist (`gap-4`, `p-4`, `w-full`, `grid-cols-3`, `text-sm`, `font-medium`, `rounded-md` exist; `mb-7`, `text-3xl`, `max-w-3xl`, `h-72` do not). For layout glue, prefer inline `style` with token variables, or grep `_ds_bundle.css` for the class first.

Semantic color utilities (all exist): `bg-background` `bg-card` `bg-muted` `bg-primary` `bg-primary-subtle` `text-foreground` `text-muted-foreground` `text-primary-foreground` `text-success-text` `border-border`.

Token variables (all defined in `styles.css`): `--background` `--foreground` `--card` `--primary` `--muted` `--muted-foreground` `--accent` `--border` `--ring` `--destructive` `--success` `--warning` `--info` `--primary-subtle` `--success-subtle` `--sidebar`; radii `--radius` `--radius-button` `--radius-input` `--radius-card` `--radius-overlay`.

Surfaces are deliberately quiet: `muted`, `secondary` and `accent` are near-white (`#fbfbfb`, 3% black). `Skeleton`, `Progress` tracks and `secondary` buttons look faint by design. Do not darken them; separate regions with borders, as the components do.

## Where to look

- `_ds/<folder>/styles.css` and `_ds_bundle.css`: the real tokens and utilities.
- `components/<group>/<Name>/<Name>.prompt.md` and `.d.ts`: per-component usage and props. Groups: actions, forms, overlays, navigation, data, feedback, layout.

## Example

```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge, Button } =
  window.OrviloUI;

<Card style={{ width: 360 }}>
  <CardHeader>
    <CardTitle>Weekly sync</CardTitle>
    <CardDescription>Review open issues and decide what ships.</CardDescription>
  </CardHeader>
  <CardContent>
    <div style={{ display: 'flex', gap: 8 }}>
      <Badge variant="info-light">12 in progress</Badge>
      <Badge variant="warning-light">4 blocked</Badge>
    </div>
  </CardContent>
  <CardFooter>
    <Button size="sm">Open board</Button>
  </CardFooter>
</Card>;
```

`Button` variants: `default` `secondary` `outline` `ghost` `destructive` `link`; sizes `xs` `sm` `default` `lg` `icon`. `Badge` variants include `default` `secondary` `outline` `info` `success` `warning` `destructive` and `*-light` forms.
