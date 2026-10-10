# Flex Layout Guide (Tailwind)

Layouts are plain `<div>` + Tailwind flex utilities. The old lobehub `Flexbox`/`Center` props map mechanically — lobehub's **default direction is `column`**; only `horizontal` made a row.

## Prop → class mapping

| lobehub                   | Tailwind                                                     |
| ------------------------- | ------------------------------------------------------------ |
| `<Flexbox>` (default)     | `flex flex-col`                                              |
| `<Flexbox horizontal>`    | `flex` (row)                                                 |
| `<Center>`                | `flex items-center justify-center` (plus `flex-col` intent)  |
| `gap={n}`                 | `gap-[n/4]` (4px per unit: 4→`gap-1`, 8→`gap-2`, 16→`gap-4`) |
| `align="center"`          | `items-center` (`start`→`items-start`, `end`→`items-end`)    |
| `justify="space-between"` | `justify-between`                                            |
| `flex={1}`                | `flex-1` (`flex="none"` → `flex-none`)                       |
| `width={280}`             | `w-70` (px ÷ 4); keep in `style` only if computed at runtime |
| `height={44}`             | `h-11` (px ÷ 4); `'100%'` → `h-full`                         |
| `padding`/`paddingInline` | `p-*` / `px-*`                                               |
| `inline`                  | `inline-flex`                                                |
| `wrap`                    | `flex-wrap`                                                  |
| `distribution`/`align`    | matching `items-*`/`justify-*`                               |
| anything dynamic          | keep `style={{...}}`                                         |

## Example

```jsx
// was <Flexbox horizontal height={'100%'} width={'100%'}>
<div className="flex h-full w-full">
  <div className="flex w-65 flex-col overflow-y-auto border-r">
    <SidebarContent />
  </div>
  <div className="flex flex-1 flex-col">
    <div className="flex-1 overflow-y-auto p-6">
      <MainContent />
    </div>
    <div className="border-t px-6 py-4">
      <Footer />
    </div>
  </div>
</div>
```

## Best practices

- `flex-1` to fill available space; `min-h-0`/`min-w-0` on children that must shrink to scroll
- `gap-*` instead of margin for spacing
- Nest flex containers for complex layouts
- Plain divs must never carry lobehub props (`gap=`, `align=`, `horizontal=`)
