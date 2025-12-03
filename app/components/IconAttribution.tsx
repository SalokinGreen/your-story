"use client";

import React, { useState } from "react";
import {
  GAME_ICON_AUTHORS,
  GAME_ICON_COUNT,
  GameIconAuthor,
} from "../misc/gameIcons";

interface IconAttributionProps {
  /** Show as a compact link or full credits panel */
  variant?: "link" | "panel" | "footer";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Icon attribution component for CC BY 3.0 compliance.
 *
 * According to the license, we must include a mention "Icons made by {author}"
 * for icons provided under Creative Commons 3.0 BY license.
 *
 * Some icons are CC0 (Viscious Speed, Zeromancer) and don't require attribution,
 * but we include them for completeness.
 */
export const IconAttribution: React.FC<IconAttributionProps> = ({
  variant = "link",
  className = "",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter out CC0 authors for attribution purposes (though we still credit them)
  const attributionAuthors = GAME_ICON_AUTHORS.filter((a) => !a.isCC0);
  const cc0Authors = GAME_ICON_AUTHORS.filter((a) => a.isCC0);

  if (variant === "link") {
    return (
      <a
        href="https://game-icons.net"
        target="_blank"
        rel="noopener noreferrer"
        className={`text-xs text-gray-500 hover:text-purple-500 transition-colors ${className}`}
      >
        Icons by game-icons.net
      </a>
    );
  }

  if (variant === "footer") {
    return (
      <div className={`text-xs text-gray-500 dark:text-gray-400 ${className}`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="hover:text-purple-500 transition-colors underline decoration-dotted"
        >
          Icons from game-icons.net
        </button>{" "}
        under{" "}
        <a
          href="https://creativecommons.org/licenses/by/3.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-purple-500 transition-colors"
        >
          CC BY 3.0
        </a>
        {isExpanded && (
          <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg max-h-48 overflow-y-auto">
            <p className="mb-2 font-medium">
              {GAME_ICON_COUNT.toLocaleString()} icons from{" "}
              {GAME_ICON_AUTHORS.length} artists:
            </p>
            <div className="flex flex-wrap gap-1">
              {attributionAuthors.map((author) => (
                <span
                  key={author.id}
                  className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded text-xs"
                >
                  {author.name}
                </span>
              ))}
            </div>
            {cc0Authors.length > 0 && (
              <p className="mt-2 text-gray-400">
                CC0 (Public Domain): {cc0Authors.map((a) => a.name).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full panel variant
  return (
    <div
      className={`p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
        Icon Credits
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        This project uses {GAME_ICON_COUNT.toLocaleString()} icons from{" "}
        <a
          href="https://game-icons.net"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
        >
          game-icons.net
        </a>
        , provided under the{" "}
        <a
          href="https://creativecommons.org/licenses/by/3.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
        >
          Creative Commons 3.0 BY
        </a>{" "}
        license.
      </p>

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Icons made by:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {attributionAuthors.map((author) => (
            <AuthorBadge key={author.id} author={author} />
          ))}
        </div>

        {cc0Authors.length > 0 && (
          <>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-3">
              CC0 (Public Domain):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cc0Authors.map((author) => (
                <AuthorBadge key={author.id} author={author} isCC0 />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Helper component for author badges
const AuthorBadge: React.FC<{ author: GameIconAuthor; isCC0?: boolean }> = ({
  author,
  isCC0,
}) => {
  const authorUrls: Record<string, string> = {
    lorc: "http://lorcblog.blogspot.com",
    delapouite: "https://delapouite.com",
    "john-colburn": "http://ninmunanmu.com",
    felbrigg: "http://blackdogofdoom.blogspot.co.uk",
    "john-redman": "http://www.uniquedicetowers.com",
    "carl-olsen": "https://twitter.com/unstoppableCarl",
    sbed: "http://opengameart.org/content/95-game-icons",
    willdabeast: "http://wjbstories.blogspot.com",
    "viscious-speed": "http://viscious-speed.deviantart.com",
    "lord-berandas": "http://berandas.deviantart.com",
    irongamer: "http://ecesisllc.wix.com/home",
    "heavenly-dog": "http://www.gnomosygoblins.blogspot.com",
    faithtoken: "http://fungustoken.deviantart.com",
    andymeneely: "http://www.se.rit.edu/~andy/",
    sparker: "http://citizenparker.com",
    guard13007: "https://guard13007.com",
    darkzaitzev: "http://darkzaitzev.deviantart.com",
  };

  const url = authorUrls[author.id];

  const badge = (
    <span
      className={`px-2 py-1 rounded text-xs ${
        isCC0
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
          : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
      }`}
    >
      {author.name}
    </span>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:opacity-80 transition-opacity"
      >
        {badge}
      </a>
    );
  }

  return badge;
};

export default IconAttribution;
