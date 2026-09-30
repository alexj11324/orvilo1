'use client';

import { cn } from 'cn';
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react';
import * as React from 'react';

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

interface CarouselProps {
  opts?: CarouselOptions;
  orientation?: 'horizontal' | 'vertical';
  plugins?: CarouselPlugin;
  setApi?: (api: CarouselApi) => void;
}

type CarouselContextProps = CarouselProps & {
  api: CarouselApi;
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
};

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = React.use(CarouselContext);
  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />');
  }
  return context;
}

function Carousel({
  orientation = 'horizontal',
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === 'horizontal' ? 'x' : 'y',
    },
    plugins,
  );

  React.useEffect(() => {
    if (api && setApi) {
      setApi(api);
    }
  }, [api, setApi]);

  return (
    <CarouselContext
      value={{
        api,
        carouselRef,
        opts,
        orientation: orientation || (opts?.axis === 'y' ? 'vertical' : 'horizontal'),
        plugins,
        setApi,
      }}
    >
      <div
        aria-roledescription="carousel"
        className={cn('relative', className)}
        data-slot="carousel"
        role="region"
        {...props}
      >
        {children}
      </div>
    </CarouselContext>
  );
}

function CarouselContent({
  className,
  viewportClassName,
  viewportStyle,
  ...props
}: React.ComponentProps<'div'> & {
  viewportClassName?: string;
  viewportStyle?: React.CSSProperties;
}) {
  const { carouselRef, orientation } = useCarousel();

  return (
    <div
      className={cn('overflow-hidden', viewportClassName)}
      data-slot="carousel-content"
      ref={carouselRef}
      style={viewportStyle}
    >
      <div
        className={cn('flex', orientation === 'horizontal' ? '-ms-4' : '-mt-4 flex-col', className)}
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, ...props }: React.ComponentProps<'div'>) {
  const { orientation } = useCarousel();

  return (
    <div
      aria-roledescription="slide"
      data-slot="carousel-item"
      role="group"
      className={cn(
        'min-w-0 shrink-0 grow-0 basis-full',
        orientation === 'horizontal' ? 'ps-4' : 'pt-4',
        className,
      )}
      {...props}
    />
  );
}

export { Carousel, type CarouselApi, CarouselContent, CarouselItem, useCarousel };
