export const styles = {
  preview: [
    'overflow-x-hidden overflow-y-scroll w-full max-w-[var(--preview-max-width,none)] max-h-[70dvh] [margin:var(--preview-margin,0)]',
    'border border-border rounded-(--radius-card) bg-card',
    String.raw`[&_.react-pdf\_\_Document_*]:pointer-events-none [&_.react-pdf\_\_Page_*]:pointer-events-none`,
    '[&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:bg-transparent',
    '[@media(width<=575.98px)]:max-h-[40dvh]',
  ].join(' '),
  previewNarrow: '[--preview-max-width:480px] [--preview-margin:0_auto]',
  previewWide: '[--preview-max-width:none] [--preview-margin:0]',
};
