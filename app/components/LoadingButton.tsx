"use client";

import React from "react";
import { DynamicIcon } from "./DynamicIcon";

interface LoadingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  icon?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

/**
 * A button component with built-in loading state.
 * Shows a spinner and optional loading text when loading=true.
 */
export function LoadingButton({
  loading = false,
  loadingText,
  icon,
  variant = "primary",
  size = "md",
  children,
  disabled,
  className = "",
  ...props
}: LoadingButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ys-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ys-bg disabled:cursor-not-allowed";

  const variantStyles = {
    primary:
      "bg-ys-accent hover:opacity-90 text-ys-on-accent shadow-md hover:shadow-lg disabled:opacity-50 disabled:shadow-none",
    secondary:
      "bg-ys-surface-2 hover:bg-ys-border text-ys-text disabled:opacity-50",
    danger:
      "bg-ys-danger/15 hover:bg-ys-danger/25 border border-ys-danger/40 text-ys-danger shadow-md disabled:opacity-50",
    ghost:
      "bg-transparent hover:bg-ys-surface-2 text-ys-muted hover:text-ys-text disabled:bg-transparent disabled:opacity-50",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-3 text-base",
  };

  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />
          {loadingText || children}
        </>
      ) : (
        <>
          {icon && (
            <DynamicIcon
              name={icon}
              className={size === "lg" ? "w-5 h-5" : "w-4 h-4"}
            />
          )}
          {children}
        </>
      )}
    </button>
  );
}
