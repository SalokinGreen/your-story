// Static icon imports for landing page - tree-shaken for better bundle size
// Only includes icons actually used on the landing page
import {
  BookOpen,
  Dices,
  TrendingUp,
  Wand2,
  Volume2,
  Heart,
  Users,
  Smartphone,
  Sword,
  Rocket,
  Ghost,
  Search,
  Sun,
  Compass,
  MessageSquare,
  Sparkles,
  Bot,
  Palette,
  Shield,
  Zap,
  Flame,
  ChevronRight,
  Star,
  Layers,
  Coins,
  Key,
  Check,
  ChevronUp,
  ChevronDown,
  Settings,
  Brain,
  Library,
  User,
  LogOut,
  type LucideProps,
} from "lucide-react";
import React from "react";

// Map of icon names to components
const iconMap: Record<string, React.FC<LucideProps>> = {
  BookOpen,
  Dices,
  TrendingUp,
  Wand2,
  Volume2,
  Heart,
  Users,
  Smartphone,
  Sword,
  Rocket,
  Ghost,
  Search,
  Sun,
  Compass,
  MessageSquare,
  Sparkles,
  Bot,
  Palette,
  Shield,
  Zap,
  Flame,
  ChevronRight,
  Star,
  Layers,
  Coins,
  Key,
  Check,
  ChevronUp,
  ChevronDown,
  Settings,
  Brain,
  Library,
  User,
  LogOut,
};

interface StaticIconProps extends LucideProps {
  name: string;
}

/**
 * Statically imported icon component for the landing page.
 * Uses tree-shaking to only include icons that are actually used.
 * For pages that need dynamic icons, use DynamicIcon instead.
 */
export const StaticIcon: React.FC<StaticIconProps> = ({ name, ...props }) => {
  const IconComponent = iconMap[name];

  if (!IconComponent) {
    // Fallback to a circle if icon not found
    return (
      <span
        className="inline-block rounded-full bg-gray-400"
        style={{ width: props.size || 16, height: props.size || 16 }}
      />
    );
  }

  return <IconComponent {...props} />;
};
