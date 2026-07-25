"use client";

import { useState, useEffect } from "react";
import { NPCReaction } from "../misc/structs";

interface NPCReactionToastProps {
  reaction: NPCReaction;
  onDismiss: () => void;
}

export default function NPCReactionToast({
  reaction,
  onDismiss,
}: NPCReactionToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  // Auto-dismiss after 4 seconds with progress
  useEffect(() => {
    const duration = 4000;
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          handleDismiss();
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  return (
    <div
      className={`
        pointer-events-auto cursor-pointer
        flex items-center gap-3 
        bg-gray-900/95 dark:bg-gray-800/95
        backdrop-blur-sm
        border border-gray-700 dark:border-gray-600
        rounded-xl shadow-2xl
        px-4 py-3
        min-w-[280px] max-w-[360px]
        transform transition-all duration-300 ease-out
        ${
          isExiting
            ? "opacity-0 translate-x-4 scale-95"
            : "opacity-100 translate-x-0 scale-100"
        }
        hover:bg-gray-800/95 dark:hover:bg-gray-700/95
      `}
      onClick={handleDismiss}
      style={{
        animation: isExiting ? "" : "slideInRight 0.3s ease-out",
      }}
    >
      {/* NPC Avatar */}
      <div className="relative shrink-0">
        {reaction.npcImage ? (
          <img
            src={reaction.npcImage}
            alt={reaction.npcName}
            className="w-12 h-12 rounded-full object-cover ring-2 ring-indigo-500/50"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center ring-2 ring-indigo-500/50">
            <span className="text-white text-lg font-bold">
              {reaction.npcName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {/* Online-style indicator dot */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-900 dark:border-gray-800 flex items-center justify-center">
          {reaction.emoji && (
            <span className="text-[10px]">{reaction.emoji}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white truncate">
            {reaction.npcName}
          </span>
          <span className="text-gray-300 truncate">{reaction.reaction}</span>
          {reaction.emoji && !reaction.npcImage && (
            <span className="text-lg shrink-0">{reaction.emoji}</span>
          )}
        </div>
        {reaction.context && (
          <p className="text-sm text-gray-400 truncate mt-0.5">
            {reaction.context}
          </p>
        )}
      </div>

      {/* Progress bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700/50 rounded-b-xl overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-indigo-500 to-purple-500 transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Container for multiple NPC reactions
interface NPCReactionContainerProps {
  reactions: NPCReaction[];
  onDismissReaction: (index: number) => void;
}

export function NPCReactionContainer({
  reactions,
  onDismissReaction,
}: NPCReactionContainerProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col-reverse gap-3 pointer-events-none">
      {reactions.map((reaction, index) => (
        <NPCReactionToast
          key={`${reaction.npcId}-${index}`}
          reaction={reaction}
          onDismiss={() => onDismissReaction(index)}
        />
      ))}
      <style jsx global>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
