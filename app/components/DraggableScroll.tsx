"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";

interface DraggableScrollProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  showIndicators?: boolean;
}

/**
 * A wrapper component that enables click-and-drag horizontal scrolling.
 * Users can click and drag to scroll the content, making navigation easier
 * for long horizontal lists like category selectors.
 */
export function DraggableScroll({
  children,
  className = "",
  innerClassName = "",
  showIndicators = true,
}: DraggableScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);
  
  // Scroll indicator state
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Check scroll position and update indicators
  const updateScrollIndicators = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScroll = scrollWidth - clientWidth;
    
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft < maxScroll - 5);
    setScrollProgress(maxScroll > 0 ? scrollLeft / maxScroll : 0);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;

    setIsDragging(true);
    hasMovedRef.current = false;
    startXRef.current = e.pageX;
    scrollLeftRef.current = container.scrollLeft;
    container.style.cursor = "grabbing";
    container.style.userSelect = "none";
  }, []);

  // Use window-level listeners for mousemove and mouseup to handle fast dragging
  useEffect(() => {
    if (!isDragging) return;

    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const x = e.pageX;
      const walk = (x - startXRef.current) * 1.5; // Scroll speed multiplier

      if (Math.abs(walk) > 5) {
        hasMovedRef.current = true;
      }

      container.scrollLeft = scrollLeftRef.current - walk;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      container.style.cursor = "grab";
      container.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Handle click prevention when dragging
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (hasMovedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  // Touch support for mobile
  const touchStartXRef = useRef(0);
  const touchScrollLeftRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;

    touchStartXRef.current = e.touches[0].pageX;
    touchScrollLeftRef.current = container.scrollLeft;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const x = e.touches[0].pageX;
    const walk = (x - touchStartXRef.current) * 1.5;
    container.scrollLeft = touchScrollLeftRef.current - walk;
  }, []);

  // Set initial cursor style and scroll indicators
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.style.cursor = "grab";
      updateScrollIndicators();
    }
  }, [updateScrollIndicators]);

  // Update indicators on scroll
  const handleScroll = useCallback(() => {
    updateScrollIndicators();
  }, [updateScrollIndicators]);

  // Update indicators on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      updateScrollIndicators();
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [updateScrollIndicators]);

  // Scroll by clicking arrows
  const scrollBy = useCallback((direction: "left" | "right") => {
    const container = containerRef.current;
    if (!container) return;
    
    const scrollAmount = container.clientWidth * 0.5;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }, []);

  const showScrollUI = showIndicators && (canScrollLeft || canScrollRight);

  return (
    <div className="relative">
      {/* Left scroll indicator */}
      {showScrollUI && canScrollLeft && (
        <button
          onClick={() => scrollBy("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center bg-linear-to-r from-blue-950/90 to-transparent hover:from-blue-900/95 transition-colors"
          aria-label="Scroll left"
        >
          <svg
            className="w-4 h-4 text-blue-300 animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {/* Right scroll indicator */}
      {showScrollUI && canScrollRight && (
        <button
          onClick={() => scrollBy("right")}
          className="absolute right-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center bg-linear-to-l from-blue-950/90 to-transparent hover:from-blue-900/95 transition-colors"
          aria-label="Scroll right"
        >
          <svg
            className="w-4 h-4 text-blue-300 animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      <div
        ref={containerRef}
        className={`overflow-x-auto overflow-y-hidden scrollbar-hide ${className}`}
        onMouseDown={handleMouseDown}
        onClickCapture={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onScroll={handleScroll}
      >
        <div className={`flex w-max ${innerClassName}`}>{children}</div>
      </div>

      {/* Scroll progress indicator */}
      {showScrollUI && (
        <div className="mt-2 w-full h-1 bg-blue-900/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500/70 rounded-full transition-all duration-150"
            style={{ 
              width: "20%",
              marginLeft: `${scrollProgress * 80}%` 
            }}
          />
        </div>
      )}
    </div>
  );
}
