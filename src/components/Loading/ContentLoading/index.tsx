/**
 * Loading state for a content region whose chrome is already on screen.
 *
 * Deliberately draws no structure: it fills whatever container it is given, so
 * it cannot promise a layout the incoming page does not have. That is why it —
 * and not a skeleton — sits in the main layout's outlet boundary, which is
 * shared by pages as different as a settings form, a community grid and a
 * conversation. `BrandTextLoading` stays for full-page boundaries.
 */
const ContentLoading = () => (
  <div className="flex size-full min-h-24 items-center justify-center">
    <span
      aria-label={'Loading'}
      className="size-7 animate-spin rounded-full border-2 border-selected [animation-duration:800ms] [border-block-start-color:var(--muted-foreground)]"
      role={'status'}
    />
  </div>
);

export default ContentLoading;
