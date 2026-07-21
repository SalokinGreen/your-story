"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import APIKeysModal from "./APIKeysModal";

export default function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [showAPIKeysModal, setShowAPIKeysModal] = useState(false);

  const isActive = (path: string) => pathname === path;

  // Hidden while actively playing a story — the story page has its own
  // compact controls and doesn't need the persistent site chrome.
  if (pathname?.startsWith("/story")) {
    return null;
  }

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    // Middle click
    if (e.button === 1) {
      e.preventDefault();
      window.open(path, "_blank");
      return;
    }
    // Ctrl/Cmd+click - open in new tab
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      window.open(path, "_blank");
      return;
    }
    // Normal left click
    if (e.button === 0) {
      router.push(path);
    }
  };

  const handleMouseUp = (e: React.MouseEvent, path: string) => {
    // Middle click - open in new tab
    if (e.button === 1) {
      e.preventDefault();
      window.open(path, "_blank");
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0d1829]/95 backdrop-blur-xl border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo/Brand */}
            <button
              onClick={(e) => handleNavClick(e, "/")}
              onMouseUp={(e) => handleMouseUp(e, "/")}
              className="flex items-center gap-2 text-lg font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 rounded-lg"
            >
              <DynamicIcon
                name="BookOpen"
                className="w-5 h-5 text-purple-600"
              />{" "}
              Your Story
            </button>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={(e) => handleNavClick(e, "/library")}
                onMouseUp={(e) => handleMouseUp(e, "/library")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all duration-150 flex items-center gap-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${
                  isActive("/library")
                    ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                    : "text-blue-200/70 hover:bg-white/10"
                }`}
              >
                <DynamicIcon name="Library" className="w-4 h-4" /> Library
              </button>
              <button
                onClick={(e) => handleNavClick(e, "/creator")}
                onMouseUp={(e) => handleMouseUp(e, "/creator")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all duration-150 flex items-center gap-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${
                  isActive("/creator")
                    ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                    : "text-blue-200/70 hover:bg-white/10"
                }`}
              >
                <DynamicIcon name="Sparkles" className="w-4 h-4" /> Creator
              </button>
            </nav>

            {/* Right side - Settings + Mobile Menu */}
            <div className="flex items-center gap-1">
              {/* Settings Button */}
              <button
                onClick={() => setShowAPIKeysModal(true)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                title="API Keys Settings"
              >
                <DynamicIcon
                  name="Settings"
                  className="w-5 h-5 text-blue-300/70"
                />
              </button>

              {/* Mobile Menu Button */}
              <button
                onClick={() => {
                  const menu = document.getElementById("mobile-menu");
                  if (menu) {
                    menu.classList.toggle("hidden");
                  }
                }}
                className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
              >
                <DynamicIcon
                  name="Menu"
                  className="w-5 h-5 text-white"
                />
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          <div id="mobile-menu" className="hidden md:hidden pb-3">
            <nav className="flex flex-col gap-1">
              <button
                onClick={(e) => {
                  handleNavClick(e, "/library");
                  document
                    .getElementById("mobile-menu")
                    ?.classList.add("hidden");
                }}
                onMouseUp={(e) => {
                  handleMouseUp(e, "/library");
                  document
                    .getElementById("mobile-menu")
                    ?.classList.add("hidden");
                }}
                className={`px-3 py-2 rounded-lg font-medium text-left transition-all duration-150 flex items-center gap-2 text-sm ${
                  isActive("/library")
                    ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                    : "text-blue-200/70 hover:bg-white/10"
                }`}
              >
                <DynamicIcon name="Library" className="w-4 h-4" /> Library
              </button>
              <button
                onClick={(e) => {
                  handleNavClick(e, "/creator");
                  document
                    .getElementById("mobile-menu")
                    ?.classList.add("hidden");
                }}
                onMouseUp={(e) => {
                  handleMouseUp(e, "/creator");
                  document
                    .getElementById("mobile-menu")
                    ?.classList.add("hidden");
                }}
                className={`px-3 py-2 rounded-lg font-medium text-left transition-all duration-150 flex items-center gap-2 text-sm ${
                  isActive("/creator")
                    ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                    : "text-blue-200/70 hover:bg-white/10"
                }`}
              >
                <DynamicIcon name="Sparkles" className="w-4 h-4" /> Creator
              </button>
            </nav>
          </div>
        </div>

        {/* API Keys Modal */}
        <APIKeysModal
          isOpen={showAPIKeysModal}
          onClose={() => setShowAPIKeysModal(false)}
        />
      </header>
    </>
  );
}
