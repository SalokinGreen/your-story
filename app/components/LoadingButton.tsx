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
    "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed";

  const variantStyles = {
    primary:
      "bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-md hover:shadow-lg disabled:from-gray-400 disabled:to-gray-500 disabled:shadow-none",
    secondary:
      "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400",
    danger:
      "bg-red-600 hover:bg-red-500 text-white shadow-md disabled:bg-gray-400",
    ghost:
      "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:bg-transparent disabled:text-gray-400",
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
