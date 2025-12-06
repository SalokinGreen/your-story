"use client";

import React, { useEffect, useState } from "react";
import { getGameIconPath, isGameIcon } from "../misc/gameIcons";

export interface GameIconProps {
  /** Icon ID (e.g., "sword", "magic-swirl") */
  name: string;
  /** CSS class for styling */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Size in pixels (applies to both width and height) */
  size?: number;
  /** Color for the icon (defaults to currentColor) */
  color?: string;
  /** Alt text for accessibility */
  alt?: string;
}

/**
 * GameIcon component renders SVG icons from game-icons.net
 * Icons are loaded from /public/icons/[author]/[name].svg
 *
 * The game-icons SVGs have a specific structure:
 * - A black background rectangle as the first path
 * - White (#fff) filled paths for the actual icon
 *
 * We remove the background and make the icon use currentColor for CSS styling.
 */
export const GameIcon: React.FC<GameIconProps> = ({
  name,
  className = "",
  style,
  size,
  color,
  alt,
}) => {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!name || !isGameIcon(name)) {
      setError(true);
      return;
    }

    const path = getGameIconPath(name);
    if (!path) {
      setError(true);
      return;
    }

    // Fetch the SVG content
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load icon");
        return res.text();
      })
      .then((svg) => {
        // Game-icons have this structure:
        // <svg><path d="M0 0h512v512H0z"/><path fill="#fff" d="...icon..."/></svg>
        // We need to:
        // 1. Remove the black background rectangle (first path with no fill or fill="#000")
        // 2. Change fill="#fff" to fill="currentColor"

        let modifiedSvg = svg
          // Remove the black background rectangle (matches "M0 0h512v512H0z" pattern)
          .replace(/<path[^>]*d="M0 0h512v512H0z"[^>]*\/?>/g, "")
          // Also try alternate background patterns
          .replace(/<path[^>]*d="M0 0h512v512H0z"[^>]*>[^<]*<\/path>/g, "")
          // Change white fills to currentColor
          .replace(/fill="#fff"/g, 'fill="currentColor"')
          .replace(/fill="#FFF"/g, 'fill="currentColor"')
          .replace(/fill="white"/g, 'fill="currentColor"')
          // Also handle any black fills that might be part of the icon
          .replace(/fill="#000"/g, 'fill="currentColor"')
          .replace(/fill="black"/g, 'fill="currentColor"');

        setSvgContent(modifiedSvg);
        setError(false);
      })
      .catch(() => {
        setError(true);
      });
  }, [name]);

  // Compute styles
  const computedStyle: React.CSSProperties = {
    ...style,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size ?? style?.width ?? "1em",
    height: size ?? style?.height ?? "1em",
    color: color ?? style?.color ?? "currentColor",
    flexShrink: 0,
  };

  // Error/loading fallback - show a simple circle
  if (error || !svgContent) {
    return (
      <span
        className={className}
        style={computedStyle}
        role="img"
        aria-label={alt || name || "icon"}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ width: "100%", height: "100%", opacity: 0.3 }}
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        ...computedStyle,
        // Ensure the SVG inside fills the container
        display: "inline-flex",
      }}
      role="img"
      aria-label={alt || name}
    >
      <span
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        dangerouslySetInnerHTML={{
          __html: svgContent.replace(
            "<svg",
            '<svg style="width:100%;height:100%"'
          ),
        }}
      />
    </span>
  );
};

/**
 * Preload an icon to cache it for faster subsequent renders
 */
export function preloadGameIcon(name: string): void {
  const path = getGameIconPath(name);
  if (path) {
    fetch(path).catch(() => {});
  }
}

/**
 * Preload multiple icons
 */
export function preloadGameIcons(names: string[]): void {
  names.forEach(preloadGameIcon);
}

export default GameIcon;
