"use client";

import React from "react";
import { DynamicIcon } from "./DynamicIcon";
import { useViewportHeight } from "../misc/useViewportHeight";

interface FullScreenViewProps {
  title: string;
  subtitle?: string;
  icon?: string;
  onClose: () => void;
  onBack?: () => void;
  headerActions?: React.ReactNode;
  tabs?: React.ReactNode;
  nav?: React.ReactNode;
  navClassName?: string;
  footer?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A menu/settings surface that takes over the entire viewport - the
 * game/app-like alternative to a small centered modal card. Used for the
 * app's larger, content-heavy menus; small yes/no confirmations and
 * transient prompts should keep the classic centered-card treatment.
 */
export default function FullScreenView({
  title,
  subtitle,
  icon,
  onClose,
  onBack,
  headerActions,
  tabs,
  nav,
  navClassName,
  footer,
  bodyClassName,
  className = "z-50",
  children,
}: FullScreenViewProps) {
  const viewportHeight = useViewportHeight();

  return (
    <div
      className={`fixed inset-0 ${className} flex flex-col h-dvh bg-[#0a1628] animate-fade-in`}
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 sm:px-6 py-3 sm:py-4 border-b border-white/10 bg-[#0a1628]/95 backdrop-blur-2xl">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              title="Back"
              aria-label="Back"
              className="p-2 -ml-1 text-blue-300/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
            </button>
          )}
          {icon && (
            <span className="p-1.5 sm:p-2 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20 shrink-0">
              <DynamicIcon
                name={icon}
                className="w-4 h-4 sm:w-5 sm:h-5 text-purple-300"
              />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-white truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-blue-300/60 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {headerActions}
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="p-2 text-blue-300/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <DynamicIcon name="X" className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {tabs && (
        <div className="shrink-0 border-b border-white/10 overflow-x-auto scrollbar-hide">
          {tabs}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {nav && (
          <nav
            className={`shrink-0 border-r border-white/10 overflow-y-auto bg-white/[0.02] ${navClassName ?? ""}`}
          >
            {nav}
          </nav>
        )}
        <div
          className={`flex-1 overflow-y-auto min-h-0 ${bodyClassName ?? "p-4 sm:p-6"}`}
        >
          {children}
        </div>
      </div>

      {footer && (
        <div className="shrink-0 border-t border-white/10 bg-white/[0.02]">
          {footer}
        </div>
      )}
    </div>
  );
}
