"use client";

import React from "react";
import { DynamicIcon } from "./DynamicIcon";
import {
  setupStripState,
  type SetupStripStep,
} from "../misc/setupStrip";
import type { StoryData } from "../misc/structs";

interface SetupStripProps {
  storyData: StoryData;
  /** Set on the host only; omitted for online guests, who see the strip read-only. */
  onChooseSetupStyle?: (mode: "quick" | "full") => void;
  /** Opens a note on the Notes page by title. Omitted for read-only viewers. */
  onOpenNote?: (kind: "lore" | "npc", id: string) => void;
}

/**
 * The session-zero strip above the composer: the style choice before one is
 * made, then Concept, Character, Campaign and Start with ticks.
 */
export default function SetupStrip({
  storyData,
  onChooseSetupStyle,
  onOpenNote,
}: SetupStripProps) {
  const state = setupStripState(storyData);
  if (state.kind === "hidden") return null;

  if (state.kind === "choose") {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 pb-2" role="status">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ys-border bg-ys-surface p-3">
          <p className="mr-auto text-sm text-ys-text">
            {onChooseSetupStyle
              ? "How would you like to set up?"
              : "The host is choosing how to set up."}
          </p>
          {onChooseSetupStyle && (
            <>
              <button
                type="button"
                onClick={() => onChooseSetupStyle("quick")}
                className="rounded-lg border border-ys-accent px-3 py-1 text-sm text-ys-accent"
              >
                Quick setup
              </button>
              <button
                type="button"
                onClick={() => onChooseSetupStyle("full")}
                className="rounded-lg border border-ys-border px-3 py-1 text-sm text-ys-text"
              >
                Step by step
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const canOpen = (step: SetupStripStep) =>
    !!onOpenNote && !!step.noteTitle && (step.id === "character" || step.id === "campaign");

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-2" role="status">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-ys-border bg-ys-surface px-3 py-2">
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {state.steps.map((step) => {
            const body = (
              <>
                <span
                  className={`flex ${step.done ? "text-ys-success" : "text-ys-muted"}`}
                  aria-hidden="true"
                >
                  <DynamicIcon
                    name={step.done ? "CircleCheck" : "Circle"}
                    className="h-4 w-4"
                  />
                </span>
                <span className={step.done ? "text-ys-text" : "text-ys-muted"}>
                  {step.label}
                </span>
              </>
            );
            return (
              <li key={step.id} aria-label={`${step.label}${step.done ? ", done" : ""}`}>
                {canOpen(step) ? (
                  <button
                    type="button"
                    onClick={() => onOpenNote?.("lore", step.noteTitle!)}
                    className="flex items-center gap-1 text-sm underline-offset-2 hover:underline"
                  >
                    {body}
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-sm">{body}</span>
                )}
              </li>
            );
          })}
        </ol>
        {state.awaitingApproval && (
          <span className="ml-auto text-xs text-ys-muted">your OK is next</span>
        )}
      </div>
    </div>
  );
}
