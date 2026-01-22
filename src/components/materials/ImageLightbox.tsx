import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex, isOpen, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setScale(1);
  }, [initialIndex, isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, currentIndex]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setScale(1);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setScale(1);
  }, [images.length]);

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }
    setTouchStart(null);
  };

  const toggleZoom = () => {
    setScale((prev) => (prev === 1 ? 2 : 1));
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-6 w-6" />
      </Button>

      {/* Zoom button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 z-10 text-white hover:bg-white/20"
        onClick={(e) => {
          e.stopPropagation();
          toggleZoom();
        }}
      >
        {scale === 1 ? <ZoomIn className="h-6 w-6" /> : <ZoomOut className="h-6 w-6" />}
      </Button>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 h-12 w-12"
            onClick={(e) => {
              e.stopPropagation();
              goToPrevious();
            }}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 h-12 w-12"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </>
      )}

      {/* Image container */}
      <div 
        className="w-full h-full flex items-center justify-center p-4 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={images[currentIndex]}
          alt={`Photo ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain transition-transform duration-200 select-none"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
        />
      </div>

      {/* Image counter */}
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-3 py-1 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2">
          {images.map((_, idx) => (
            <button
              key={idx}
              className={`w-2 h-2 rounded-full transition-colors ${
                idx === currentIndex ? 'bg-white' : 'bg-white/40'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
                setScale(1);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
