"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";

export interface CategoryItem {
  id: string;
  label: string;
  icon: string;
}

interface ClockCategorySelectorProps {
  categories: CategoryItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  completedIndices?: number[]; // Indices that are "completed" (before current)
}

export function ClockCategorySelector({
  categories,
  currentIndex,
  onSelect,
  completedIndices = [],
}: ClockCategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localIndex, setLocalIndex] = useState(currentIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false); // Track if actual drag occurred
  const hasDraggedRef = useRef(false); // Ref for synchronous check in click handler
  const [dragStartY, setDragStartY] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [animatedOffset, setAnimatedOffset] = useState(0); // Smooth animation offset
  const containerRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Sync local index with prop when closed
  useEffect(() => {
    if (!isOpen) {
      setLocalIndex(currentIndex);
    }
  }, [currentIndex, isOpen]);

  // Smoothly animate the offset back to 0
  useEffect(() => {
    if (animatedOffset === 0) return;

    const animate = () => {
      setAnimatedOffset((prev) => {
        // Ease toward 0
        const next = prev * 0.85;
        return Math.abs(next) < 0.5 ? 0 : next;
      });
    };

    const frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [animatedOffset]);

  // Wheel configuration
  const visibleRange = 4; // Items visible above and below center
  const itemSpacing = 68; // Pixels between items

  // Handle wheel scroll
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!isOpen) return;
      e.preventDefault();

      const delta = e.deltaY > 0 ? 1 : -1;
      // Add animation offset in the direction of scroll for smooth feel
      setAnimatedOffset(-delta * itemSpacing * 0.5);
      setLocalIndex((prev) => {
        const next = prev + delta;
        return Math.max(0, Math.min(categories.length - 1, next));
      });
    },
    [isOpen, categories.length, itemSpacing]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        setAnimatedOffset(itemSpacing * 0.5);
        setLocalIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        setAnimatedOffset(-itemSpacing * 0.5);
        setLocalIndex((prev) => Math.min(categories.length - 1, prev + 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(localIndex);
        setIsOpen(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
    },
    [isOpen, categories.length, localIndex, onSelect]
  );

  // Handle touch/mouse drag
  const handleDragStart = (clientY: number) => {
    setIsDragging(true);
    setHasDragged(false);
    hasDraggedRef.current = false;
    setDragStartY(clientY);
    setDragOffset(0);
    setAnimatedOffset(0);
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    // Just update the visual offset - don't change index during drag
    const delta = dragStartY - clientY;

    // Mark as dragged if moved more than a small threshold
    if (Math.abs(delta) > 5) {
      setHasDragged(true);
      hasDraggedRef.current = true;
    }

    setDragOffset(delta);
  };

  const handleDragEnd = () => {
    setIsDragging(false);

    // Only process drag selection if user actually dragged
    if (!hasDragged) {
      setDragOffset(0);
      return;
    }

    // Calculate which item should be selected based on total drag distance
    const itemsMoved = Math.round(dragOffset / itemSpacing);

    if (itemsMoved !== 0) {
      // Calculate new index
      const newIndex = Math.max(
        0,
        Math.min(categories.length - 1, localIndex + itemsMoved)
      );
      const actualItemsMoved = newIndex - localIndex;

      // Set the new index
      setLocalIndex(newIndex);

      // Set animated offset to smoothly settle the remainder
      // The visual position needs to animate from current position to centered on new item
      const remainderOffset = dragOffset - actualItemsMoved * itemSpacing;
      setAnimatedOffset(remainderOffset);
    } else {
      // No item change, just animate back to center
      setAnimatedOffset(dragOffset);
    }

    setDragOffset(0);
  };

  // Attach event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isOpen) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleWheel, handleKeyDown, isOpen]);

  // Touch event listeners with passive: false to allow preventDefault
  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel || !isOpen) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      handleDragStart(e.touches[0].clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleDragMove(e.touches[0].clientY);
    };

    const onTouchEnd = () => {
      handleDragEnd();
    };

    wheel.addEventListener("touchstart", onTouchStart, { passive: false });
    wheel.addEventListener("touchmove", onTouchMove, { passive: false });
    wheel.addEventListener("touchend", onTouchEnd);

    return () => {
      wheel.removeEventListener("touchstart", onTouchStart);
      wheel.removeEventListener("touchmove", onTouchMove);
      wheel.removeEventListener("touchend", onTouchEnd);
    };
  }, [isOpen, handleDragStart, handleDragMove, handleDragEnd]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    // Delay adding the listener to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const current = categories[currentIndex];
  const isCompleted = completedIndices.includes(currentIndex);

  // Generate visible items for the wheel
  const getVisibleItems = () => {
    const items: Array<{
      category: CategoryItem;
      index: number;
      offset: number;
    }> = [];

    // Calculate extra items needed based on current drag/animation offset
    const totalOffset = dragOffset + animatedOffset;
    const extraItems = Math.ceil(Math.abs(totalOffset) / itemSpacing) + 1;
    const expandedRange = visibleRange + extraItems;

    for (let offset = -expandedRange; offset <= expandedRange; offset++) {
      const index = localIndex + offset;
      if (index >= 0 && index < categories.length) {
        items.push({
          category: categories[index],
          index,
          offset,
        });
      }
    }

    return items;
  };

  // Calculate item styles based on distance from center
  const getWheelItemStyle = (offset: number) => {
    // Combine drag offset (while dragging) and animated offset (smooth transitions)
    // dragOffset is already in pixels relative to itemSpacing threshold
    const totalOffset = dragOffset + animatedOffset;

    // Y position: simple linear spacing with combined offset
    const y = offset * itemSpacing - totalOffset;

    // Distance from center for fade/scale (account for animation)
    const visualOffset = offset - totalOffset / itemSpacing;
    const absOffset = Math.abs(visualOffset);
    const distanceFactor = Math.max(0, 1 - absOffset / (visibleRange + 1));

    // Scale: center items larger
    const scale = 0.7 + distanceFactor * 0.3;

    // Opacity: fade items further from center
    const opacity = 0.3 + distanceFactor * 0.7;

    // Z-index: center items on top
    const zIndex = 100 - Math.round(absOffset) * 10;

    // Item is "center" if it's visually close to the center position
    const isNearCenter = absOffset < 0.5;

    return {
      y,
      scale,
      opacity,
      zIndex,
      isNearCenter,
    };
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Closed state - shows current category as a button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
          isCompleted
            ? "bg-green-900/40 border-2 border-green-600/50 text-green-300"
            : "bg-purple-600/80 border-2 border-purple-400/50 text-white"
        } hover:scale-105 shadow-lg`}
      >
        <DynamicIcon name={current.icon} className="w-5 h-5" />
        <span className="font-semibold">{current.label}</span>
        <DynamicIcon
          name="ChevronsUpDown"
          className="w-4 h-4 opacity-60 ml-1"
        />
      </button>

      {/* Open state - 3D wheel selector */}
      {isOpen && (
        <>
          {/* Backdrop with blur */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Wheel container */}
          <div
            ref={wheelRef}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 touch-none"
            onMouseDown={(e) => handleDragStart(e.clientY)}
            onMouseMove={(e) => handleDragMove(e.clientY)}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
          >
            {/* Header with title */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
              <div className="text-purple-300 text-sm font-medium tracking-wider uppercase opacity-80">
                Select Category
              </div>
              <div className="text-blue-300/60 text-xs mt-1">
                Scroll or drag • Click to select
              </div>
            </div>

            {/* 3D Wheel Scene */}
            <div
              className="relative select-none"
              style={{
                width: "340px",
                height: "380px",
                cursor: isDragging ? "grabbing" : "grab",
              }}
            >
              {/* Decorative ring */}
              <div
                className="absolute rounded-full border-4 border-purple-500/20 pointer-events-none"
                style={{
                  top: "20px",
                  left: "0",
                  right: "0",
                  bottom: "20px",
                  boxShadow:
                    "inset 0 0 60px rgba(139, 92, 246, 0.1), 0 0 40px rgba(139, 92, 246, 0.1)",
                }}
              />
              <div
                className="absolute rounded-full border-2 border-purple-400/10 pointer-events-none"
                style={{
                  top: "36px",
                  left: "16px",
                  right: "16px",
                  bottom: "36px",
                }}
              />

              {/* Center highlight glow */}
              <div
                className="absolute left-0 right-0 pointer-events-none z-20"
                style={{
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: "56px",
                  background:
                    "linear-gradient(to bottom, transparent, rgba(139, 92, 246, 0.15) 40%, rgba(139, 92, 246, 0.15) 60%, transparent)",
                }}
              />

              {/* Selection indicator lines */}
              <div
                className="absolute left-8 right-8 h-0.5 bg-purple-400/40 pointer-events-none z-10"
                style={{ top: "calc(50% - 28px)" }}
              />
              <div
                className="absolute left-8 right-8 h-0.5 bg-purple-400/40 pointer-events-none z-10"
                style={{ top: "calc(50% + 27px)" }}
              />

              {/* 3D Wheel Container */}
              <div
                className="absolute inset-0"
                style={{
                  overflow: "visible",
                }}
              >
                {/* Wheel items positioned around center */}
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: "280px",
                    height: "0px",
                  }}
                >
                  {getVisibleItems().map(({ category, index, offset }) => {
                    const style = getWheelItemStyle(offset);
                    const isCenter = style.isNearCenter;
                    const isItemCompleted = completedIndices.includes(index);

                    // Determine colors based on state
                    const bgColor = isCenter
                      ? "rgba(147, 51, 234, 0.9)" // purple-600/90
                      : isItemCompleted
                      ? "rgba(20, 83, 45, 0.6)" // green-900/60
                      : "rgba(23, 37, 84, 0.8)"; // blue-950/80

                    const textColor = isCenter
                      ? "#ffffff"
                      : isItemCompleted
                      ? "rgb(134, 239, 172)" // green-300
                      : "rgb(191, 219, 254)"; // blue-200

                    const iconBgColor = isCenter
                      ? "rgba(168, 85, 247, 0.5)" // purple-500/50
                      : isItemCompleted
                      ? "rgba(34, 197, 94, 0.3)" // green-500/30
                      : "rgba(30, 64, 175, 0.5)"; // blue-800/50

                    return (
                      <button
                        key={category.id}
                        onClick={() => {
                          // Only select if this was a pure click, not a drag
                          if (hasDraggedRef.current) return;
                          onSelect(index);
                          setIsOpen(false);
                        }}
                        style={{
                          position: "absolute",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 20px",
                          borderRadius: "12px",
                          width: "280px",
                          left: "-140px",
                          top: `${style.y}px`,
                          marginTop: "-24px",
                          transform: `scale(${style.scale})`,
                          opacity: style.opacity,
                          zIndex: style.zIndex,
                          backgroundColor: bgColor,
                          color: textColor,
                          fontWeight: isCenter ? "700" : "400",
                          boxShadow: isCenter
                            ? "0 10px 15px -3px rgba(168, 85, 247, 0.3)"
                            : "none",
                          border: "none",
                          cursor: "pointer",
                          transition: isDragging
                            ? "background-color 0.15s"
                            : "top 0.2s ease-out, transform 0.2s ease-out, opacity 0.2s ease-out, background-color 0.15s",
                        }}
                      >
                        <div
                          style={{
                            padding: "8px",
                            borderRadius: "8px",
                            flexShrink: 0,
                            backgroundColor: iconBgColor,
                          }}
                        >
                          <DynamicIcon
                            name={
                              isItemCompleted && !isCenter
                                ? "Check"
                                : category.icon
                            }
                            className="w-5 h-5"
                          />
                        </div>
                        <span
                          style={{
                            flex: 1,
                            textAlign: "left",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {category.label}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            flexShrink: 0,
                            color: isCenter ? "rgb(233, 213, 255)" : undefined,
                            opacity: isCenter ? 1 : 0.5,
                          }}
                        >
                          {index + 1}/{categories.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation arrows */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalIndex((prev) => Math.max(0, prev - 1));
                }}
                disabled={localIndex === 0}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-30 p-2 text-purple-400 hover:text-purple-300 disabled:opacity-20 disabled:cursor-not-allowed transition-all hover:scale-110 bg-gray-900/50 rounded-full"
              >
                <DynamicIcon name="ChevronUp" className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalIndex((prev) =>
                    Math.min(categories.length - 1, prev + 1)
                  );
                }}
                disabled={localIndex === categories.length - 1}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 p-2 text-purple-400 hover:text-purple-300 disabled:opacity-20 disabled:cursor-not-allowed transition-all hover:scale-110 bg-gray-900/50 rounded-full"
              >
                <DynamicIcon name="ChevronDown" className="w-6 h-6" />
              </button>
            </div>

            {/* Footer hint */}
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
              <div className="text-blue-400/50 text-xs flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 bg-blue-900/50 rounded text-[10px]">
                  ↑↓
                </kbd>
                <span>navigate</span>
                <kbd className="px-1.5 py-0.5 bg-blue-900/50 rounded text-[10px]">
                  Enter
                </kbd>
                <span>select</span>
                <kbd className="px-1.5 py-0.5 bg-blue-900/50 rounded text-[10px]">
                  Esc
                </kbd>
                <span>close</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
