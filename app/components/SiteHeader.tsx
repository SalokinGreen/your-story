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

  // Hidden on the full-viewport workspaces. Both the story player and the
  // creator carry their own compact header and lay themselves out against the
  // full viewport height, so the sticky site chrome would overlap them. The
  // party mode phone controller is a full-screen page of its own too.
  if (
    pathname?.startsWith("/story") ||
    pathname?.startsWith("/creator") ||
    pathname?.startsWith("/party")
  ) {
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
      <header className="sticky top-0 z-50 bg-[image:var(--ys-gradient)] backdrop-blur-xl border-b border-ys-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo/Brand */}
            <button
              onClick={(e) => handleNavClick(e, "/")}
              onMouseUp={(e) => handleMouseUp(e, "/")}
              className="flex items-center gap-2 text-lg font-bold text-ys-accent hover:opacity-80 transition-opacity duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ys-accent focus-visible:ring-offset-2 rounded-lg"
            >
              <DynamicIcon
                name="BookOpen"
                className="w-5 h-5 text-ys-accent"
              />{" "}
              Endless Adventure
            </button>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={(e) => handleNavClick(e, "/library")}
                onMouseUp={(e) => handleMouseUp(e, "/library")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all duration-150 flex items-center gap-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ys-accent focus-visible:ring-offset-2 ${
                  isActive("/library")
                    ? "shadow-md bg-ys-accent text-ys-on-accent"
                    : "text-ys-text hover:bg-ys-surface-2"
                }`}
              >
                <DynamicIcon name="Library" className="w-4 h-4" /> Library
              </button>
              <button
                onClick={(e) => handleNavClick(e, "/creator")}
                onMouseUp={(e) => handleMouseUp(e, "/creator")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all duration-150 flex items-center gap-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ys-accent focus-visible:ring-offset-2 ${
                  isActive("/creator")
                    ? "shadow-md bg-ys-accent text-ys-on-accent"
                    : "text-ys-text hover:bg-ys-surface-2"
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
                className="p-2 rounded-lg hover:bg-ys-surface-2 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ys-accent focus-visible:ring-offset-2"
                title="API Keys Settings"
              >
                <DynamicIcon
                  name="Settings"
                  className="w-5 h-5 text-ys-muted"
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
                className="md:hidden p-2 rounded-lg hover:bg-ys-surface-2 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ys-accent focus-visible:ring-offset-2"
              >
                <DynamicIcon
                  name="Menu"
                  className="w-5 h-5 text-ys-text"
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
                    ? "shadow-md bg-ys-accent text-ys-on-accent"
                    : "text-ys-text hover:bg-ys-surface-2"
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
                    ? "shadow-md bg-ys-accent text-ys-on-accent"
                    : "text-ys-text hover:bg-ys-surface-2"
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
