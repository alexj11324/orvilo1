/**
 * 规则清单共用的几处样式：一行的排版与悬停，命中点的圆点，以及「全部经验」链接。
 *
 * 这里原来还有成长画像的一套（可靠度条、等级分段、判断句标题、按层画像）。S60 把画像改成
 * 规则清单后，那些只服务于「它成长得怎么样」的样式一并删掉了 —— 留下的都只描述事实。
 */
export const portraitStyles = {
  // These are noninteractive recent-record points, not action glyphs: preserve exact 7px geometry.
  dot: 'inline-block box-border size-1.75 rounded-full',
  dotBad: 'bg-warning',
  dotNone: 'border border-border bg-transparent',
  dotOk: 'bg-foreground-quaternary',
  previewTarget:
    'cursor-pointer text-start focus-visible:rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-primary-border focus-visible:outline-offset-2',
  viewAll: 'text-xs leading-5 text-muted-foreground whitespace-nowrap hover:text-foreground',
  row: 'border-0 border-be border-divider py-2.5 px-3.5 text-sm leading-5.5 last:border-be-0 [&_.teach]:opacity-0 [&_.teach]:transition-opacity [&_.teach]:duration-(--orvilo-motion-mid) [&_.teach]:ease-[ease] hover:bg-fill-quaternary hover:[&_.teach]:opacity-100 focus-within:bg-fill-quaternary focus-within:[&_.teach]:opacity-100 [@media(hover:none)]:[&_.teach]:opacity-100',
};
