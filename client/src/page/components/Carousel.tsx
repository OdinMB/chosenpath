import React, { useRef, useState, useEffect, ReactNode } from "react";
import { Icons } from "components/ui";
import { useSwipe } from "../hooks/useTemplateCarousel";

interface CarouselProps {
  items: ReactNode[];
  showControls?: boolean;
  showDots?: boolean;
  className?: string;
  itemsPerView?: number;
  itemsPerViewMobile?: number;
}

export function Carousel({ 
  items, 
  showControls = true, 
  showDots = true,
  className = "",
  itemsPerView = 1,
  itemsPerViewMobile = 1
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentItemsPerView, setCurrentItemsPerView] = useState(itemsPerViewMobile);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Update items per view based on screen size
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      setCurrentItemsPerView(isMobile ? itemsPerViewMobile : itemsPerView);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [itemsPerView, itemsPerViewMobile]);

  // Calculate total number of pages
  const totalPages = Math.ceil(items.length / currentItemsPerView);

  // Move to the previous page
  const prevItem = () => {
    if (isTransitioning || totalPages <= 1) return;

    setIsTransitioning(true);
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? totalPages - 1 : prevIndex - 1
    );
  };

  // Move to the next page
  const nextItem = () => {
    if (isTransitioning || totalPages <= 1) return;

    setIsTransitioning(true);
    setCurrentIndex((prevIndex) =>
      prevIndex === totalPages - 1 ? 0 : prevIndex + 1
    );
  };

  // Reset transition state after animation completes
  const handleTransitionEnd = () => {
    setIsTransitioning(false);
  };

  // Select a specific page by index
  const selectItemByIndex = (index: number) => {
    if (isTransitioning || index === currentIndex) return;

    setIsTransitioning(true);
    setCurrentIndex(index);
  };

  // Add swipe gesture support
  useSwipe(carouselRef, {
    onSwipeLeft: nextItem,
    onSwipeRight: prevItem,
  });

  // If items change or items per view changes, reset to first page
  useEffect(() => {
    setCurrentIndex(0);
  }, [items.length, currentItemsPerView]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`relative w-full ${className}`}>
      <div className="overflow-hidden">
        <div
          ref={carouselRef}
          className="flex transition-transform duration-300 ease-in-out touch-pan-x"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          onTransitionEnd={handleTransitionEnd}
        >
          {Array.from({ length: totalPages }).map((_, pageIndex) => (
            <div key={pageIndex} className="w-full flex-shrink-0 flex gap-4">
              {Array.from({ length: currentItemsPerView }).map((_, slotIndex) => {
                const itemIndex = pageIndex * currentItemsPerView + slotIndex;
                const item = items[itemIndex];
                return (
                  <div
                    key={slotIndex}
                    className={`${currentItemsPerView > 1 ? 'flex-1' : 'w-full'}`}
                  >
                    {item || <div className="invisible">{items[0]}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {totalPages > 1 && showControls && (
        <div className="flex justify-between mt-2">
          <button
            onClick={prevItem}
            disabled={isTransitioning || totalPages <= 1}
            className="p-2 rounded-full hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <Icons.ArrowLeft className="h-4 w-4" />
          </button>

          {showDots && totalPages > 1 && (
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }).map((_, index) => (
                <button
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index === currentIndex ? "bg-primary-600" : "bg-primary-200"
                  }`}
                  onClick={() => selectItemByIndex(index)}
                  aria-label={`Go to page ${index + 1}`}
                />
              ))}
            </div>
          )}

          <button
            onClick={nextItem}
            disabled={isTransitioning || totalPages <= 1}
            className="p-2 rounded-full hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <Icons.ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}