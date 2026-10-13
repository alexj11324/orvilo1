export const MIN_IMAGE_SIZE = 64;
export const MAX_SIZE_DESKTOP = 200;
export const MAX_SIZE_MOBILE = 90;

export const styles = {
  container:
    'grid w-full gap-(--galley-grid-gap,6px) grid-cols-[repeat(var(--galley-grid-col,3),1fr)] max-w-(--galley-grid-max,200px) [&>div]:w-full [&>div]:min-w-(--galley-grid-min,64px) [&>div]:min-h-(--galley-grid-min,64px) [&>div]:max-h-[calc((var(--galley-grid-max,200px)_-_var(--galley-grid-gap,6px)_*_(var(--galley-grid-col,3)_-_1))_/_var(--galley-grid-col,3))]',
};
