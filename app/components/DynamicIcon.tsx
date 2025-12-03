import { icons, LucideProps } from "lucide-react";
import React from "react";
import { isGameIcon } from "../misc/gameIcons";
import { GameIcon } from "./GameIcon";

interface DynamicIconProps extends LucideProps {
  name: string;
}

/**
 * DynamicIcon renders icons from multiple sources:
 * 1. Game-icons.net (4000+ RPG icons) - if the name matches a game icon ID
 * 2. Lucide React icons - for UI elements (PascalCase names like "ChevronRight")
 * 3. Emoji fallback - if the name is an emoji
 * 4. Circle fallback - if nothing matches
 */
export const DynamicIcon: React.FC<DynamicIconProps> = ({
  name,
  className,
  style,
  ...props
}) => {
  // Handle empty names
  if (!name) return null;

  // Check if it's an emoji (simple check: non-ascii or specific ranges)
  const isEmoji = /\p{Extended_Pictographic}/u.test(name);
  if (isEmoji) {
    return (
      <span className="text-xl leading-none" role="img" aria-label="icon">
        {name}
      </span>
    );
  }

  // Check if it's a game-icon (kebab-case names like "sword", "magic-swirl")
  if (isGameIcon(name)) {
    return (
      <GameIcon
        name={name}
        className={className}
        style={style}
        size={typeof props.size === "number" ? props.size : undefined}
        color={props.color}
      />
    );
  }

  // Try Lucide icons (PascalCase names like "ChevronRight", "Settings")
  const IconComponent = (icons as Record<string, React.FC<LucideProps>>)[name];

  if (IconComponent) {
    return <IconComponent className={className} style={style} {...props} />;
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
      <PascalIconComponent className={className} style={style} {...props} />
    );
  }

  // Final fallback: circle icon
  return <icons.Circle className={className} style={style} {...props} />;
};
