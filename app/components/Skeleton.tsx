"use client";

import React from "react";

interface SkeletonProps {
  className?: string;
}

// Base skeleton with shimmer animation
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-linear-to-r from-white/5 via-white/10 to-white/5 bg-size-[200%_100%] animate-shimmer rounded ${className}`}
    />
  );
}

// Story card skeleton for library
export function StoryCardSkeleton() {
  return (
    <div className="bg-white/[0.03] backdrop-blur-md rounded-xl shadow-lg border border-white/10 p-4 space-y-3">
      {/* Title */}
      <Skeleton className="h-5 w-3/4" />

      {/* Preview text */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-3 pt-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

// Adventure card skeleton for explorer
export function AdventureCardSkeleton() {
  return (
    <div className="bg-white/[0.03] backdrop-blur-md rounded-xl shadow-lg border border-white/10 overflow-hidden">
      {/* Thumbnail */}
      <Skeleton className="h-40 w-full rounded-none" />

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <Skeleton className="h-5 w-4/5" />

        {/* Description */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>

        {/* Tags */}
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

// Adventure detail page skeleton
export function AdventureDetailSkeleton() {
  return (
    <div className="min-h-screen bg-transparent">
      {/* Hero Banner */}
      <Skeleton className="h-64 md:h-80 w-full rounded-none" />

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Title and meta */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/2" />

            {/* Tags */}
            <div className="flex gap-2">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
          </div>

          {/* Start button area */}
          <div className="shrink-0">
            <Skeleton className="h-14 w-48 rounded-xl" />
          </div>
        </div>

        {/* Description */}
        <div className="bg-white/[0.03] backdrop-blur-md rounded-2xl p-6 border border-white/10 space-y-3">
          <Skeleton className="h-6 w-40" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>

        {/* Stats/Presets section */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white/[0.03] backdrop-blur-md rounded-2xl p-6 border border-white/10 space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
          <div className="bg-white/[0.03] backdrop-blur-md rounded-2xl p-6 border border-white/10 space-y-4">
            <Skeleton className="h-6 w-28" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Featured carousel skeleton
export function FeaturedCarouselSkeleton() {
  return (
    <div className="relative h-80 md:h-96 rounded-2xl overflow-hidden">
      <Skeleton className="h-full w-full rounded-2xl" />
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-linear-to-t from-black/80 to-transparent">
        <Skeleton className="h-8 w-2/3 mb-3" />
        <Skeleton className="h-4 w-1/2 mb-4" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// Folder sidebar skeleton
export function FolderSidebarSkeleton() {
  return (
    <div className="bg-white/[0.03] backdrop-blur-md rounded-2xl shadow-xl p-4 border border-white/10 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

// Grid of story card skeletons
export function StoryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <StoryCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Grid of adventure card skeletons
export function AdventureGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <AdventureCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Library page skeleton (full layout)
export function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1">
        <FolderSidebarSkeleton />
      </div>
      <div className="lg:col-span-3">
        <StoryGridSkeleton count={6} />
      </div>
    </div>
  );
}
