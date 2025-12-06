import { icons, LucideProps } from "lucide-react";
import React from "react";
import { isGameIcon } from "../misc/gameIcons";
import { GameIcon } from "./GameIcon";

interface DynamicIconProps extends LucideProps {
  name: string;
}

/**
 * DynamicIcon renders icons from multiple sources with normalized sizing and colors:
 * 1. Game-icons.net (4000+ RPG icons) - if the name matches a game icon ID
 * 2. Lucide React icons - for UI elements (PascalCase names like "ChevronRight")
 * 3. Emoji fallback - if the name is an emoji
 * 4. Circle fallback - if nothing matches
 *
 * All icons inherit color from currentColor and size from className (e.g., "w-5 h-5")
 */
export const DynamicIcon: React.FC<DynamicIconProps> = ({
  name,
  className = "",
  style,
  size,
  color,
  ...props
}) => {
  // Handle empty names
  if (!name) return null;

  // Normalize size: extract pixel size from className or use size prop
  // Look for w-X h-X patterns to determine size
  const sizeMatch = className.match(/w-(\d+)/);
  // Convert size prop to number if it's a string, or use className-derived size
  const numericSize = typeof size === "string" ? parseInt(size) : size;
  const pixelSize: number | undefined =
    numericSize ?? (sizeMatch ? parseInt(sizeMatch[1]) * 4 : undefined);

  // Check if it's an emoji (simple check: non-ascii or specific ranges)
  const isEmoji = /\p{Extended_Pictographic}/u.test(name);
  if (isEmoji) {
    // Calculate emoji-specific sizes (emojis need slightly smaller font to fit)
    const hasPixelSize = pixelSize !== undefined;
    const emojiFontSize = hasPixelSize
      ? `${(pixelSize as number) * 0.75}px`
      : "0.875em";
    const emojiBoxSize = hasPixelSize ? `${pixelSize}px` : "1em";

    // Render emoji with consistent sizing matching icon dimensions
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{
          fontSize: emojiFontSize,
          lineHeight: 1,
          width: emojiBoxSize,
          height: emojiBoxSize,
          ...style,
        }}
        role="img"
        aria-label="icon"
      >
        {name}
      </span>
    );
  }

  // Check if it's a game-icon (kebab-case names like "sword", "magic-swirl")
  if (isGameIcon(name)) {
    return (
      <GameIcon
        name={name}
        className={`shrink-0 ${className}`}
        style={{ color: color ?? "currentColor", ...style }}
        size={pixelSize}
      />
    );
  }

  // Try Lucide icons (PascalCase names like "ChevronRight", "Settings")
  const IconComponent = (icons as Record<string, React.FC<LucideProps>>)[name];

  if (IconComponent) {
    return (
      <IconComponent
        className={`shrink-0 ${className}`}
        style={{ color: color ?? "currentColor", ...style }}
        size={size}
        {...props}
      />
    );
  }

  // Fallback: try converting kebab-case to PascalCase for Lucide
  const pascalName = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const PascalIconComponent = (icons as Record<string, React.FC<LucideProps>>)[
    pascalName
  ];

  if (PascalIconComponent) {
    return (
      <PascalIconComponent
        className={`shrink-0 ${className}`}
        style={{ color: color ?? "currentColor", ...style }}
        size={size}
        {...props}
      />
    );
  }

  // Final fallback: circle icon
  return (
    <icons.Circle
      className={`shrink-0 ${className}`}
      style={{ color: color ?? "currentColor", ...style }}
      size={size}
      {...props}
    />
  );
};
