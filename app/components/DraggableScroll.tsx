"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";

interface DraggableScrollProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}

/**
 * A wrapper component that enables click-and-drag horizontal scrolling.
 * Users can click and drag to scroll the content, making navigation easier
 * for long horizontal lists like category selectors.
 */
export function DraggableScroll({ children, className = "", innerClassName = "" }: DraggableScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);

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

  // Set initial cursor style
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.style.cursor = "grab";
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`overflow-x-auto overflow-y-hidden ${className}`}
      onMouseDown={handleMouseDown}
      onClickCapture={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div className={`flex w-max ${innerClassName}`}>
        {children}
      </div>
    </div>
  );
}
