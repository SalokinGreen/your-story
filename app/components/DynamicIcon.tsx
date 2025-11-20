import { icons, LucideProps } from "lucide-react";
import React from "react";

interface DynamicIconProps extends LucideProps {
  name: string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, ...props }) => {
  // Capitalize first letter just in case, though we should store exact names
  // Lucide icons are PascalCase (e.g. "Activity", "AlertCircle")

  // Handle potential emoji fallback or invalid names
  if (!name) return null;

  // Check if it's an emoji (simple check: non-ascii or specific ranges)
  // If the user has existing data with emojis, we might want to render them as text for now
  // or just fail gracefully.
  const isEmoji = /\p{Extended_Pictographic}/u.test(name);
  if (isEmoji) {
    return (
      <span className="text-xl leading-none" role="img" aria-label="icon">
        {name}
      </span>
    );
  }

  const IconComponent = (icons as any)[name];

  if (!IconComponent) {
    // Fallback icon or null
    return <icons.Circle {...props} />;
  }

  return <IconComponent {...props} />;
};
