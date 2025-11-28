import { StoryData, BooleanVariable } from "./structs";
import { logger } from "./logger";

// Process lore triggers based on story content and fulfilled beats
export function processLoreTriggers(
  storyData: StoryData,
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning"
  ) => void,
  initialLoad: boolean = false
) {
  // Only check intro + last 5 scene parts for lore triggers to reduce token costs
  const recentParts = storyData.scene.parts.slice(-5);
  const recentContent = [storyData.intro, ...recentParts.map((p) => p.content)]
    .join("\n")
    .toLowerCase();

  const currentPartIndex = storyData.scene.parts.length;

  const fulfilledBeatIndices = storyData.plot_beats
    .map((beat, index) => (beat.fulfilled ? index : -1))
    .filter((index) => index !== -1);

  // Helper to check triggers (only in recent content)
  const checkTriggers = (triggers?: string[]) => {
    if (!triggers || triggers.length === 0) return false;
    return triggers.some((t) => recentContent.includes(t.toLowerCase()));
  };

  const checkBeats = (beats?: number[]) => {
    if (!beats || beats.length === 0) return false;
    return beats.some((b) => fulfilledBeatIndices.includes(b));
  };

  // Helper to check boolean variable triggers
  const checkVarTriggers = (varNames?: string[]) => {
    if (!varNames || varNames.length === 0 || !storyData.variables)
      return false;
    return varNames.some((varName) => {
      const variable = storyData.variables?.find(
        (v) =>
          v.type === "boolean" && v.name.toLowerCase() === varName.toLowerCase()
      );
      return variable && (variable as BooleanVariable).value === true;
    });
  };

  storyData.lore.forEach((loreItem) => {
    // Enabled check (default to true if undefined)
    if (loreItem.enabled === false) {
      if (loreItem.on) {
        loreItem.on = false;
      }
      return;
    }

    // Always On check
    if (loreItem.alwaysOn) {
      if (loreItem.on !== true) {
        loreItem.on = true;
      }
      return;
    }

    // Check triggers
    const hasTextOn = checkTriggers(loreItem.on_triggers);
    const hasBeatOn = checkBeats(loreItem.beats_trigger);
    const hasVarOn = checkVarTriggers(loreItem.var_on_triggers);

    // Check lore triggers (referencing other lores)
    let hasLoreOn = false;
    if (loreItem.trigger_lores && loreItem.trigger_lores.length > 0) {
      hasLoreOn = loreItem.trigger_lores.some((title) => {
        const l = storyData.lore.find((i) => i.title === title);
        return l?.on === true;
      });
    }

    const shouldTurnOn = hasTextOn || hasBeatOn || hasLoreOn || hasVarOn;

    // Check suppressors
    const hasTextOff = checkTriggers(loreItem.off_triggers);
    const hasBeatOff = checkBeats(loreItem.beats_untrigger);
    const hasVarOff = checkVarTriggers(loreItem.var_off_triggers);

    let hasLoreOff = false;
    if (loreItem.untrigger_lores && loreItem.untrigger_lores.length > 0) {
      hasLoreOff = loreItem.untrigger_lores.some((title) => {
        const l = storyData.lore.find((i) => i.title === title);
        return l?.on === true;
      });
    }

    const shouldTurnOff = hasTextOff || hasBeatOff || hasLoreOff || hasVarOff;

    // Determine if any triggers are defined
    const hasAnyOnTriggersDefined =
      (loreItem.on_triggers && loreItem.on_triggers.length > 0) ||
      (loreItem.beats_trigger && loreItem.beats_trigger.length > 0) ||
      (loreItem.trigger_lores && loreItem.trigger_lores.length > 0) ||
      (loreItem.var_on_triggers && loreItem.var_on_triggers.length > 0);

    let isActive = false;

    if (!hasAnyOnTriggersDefined) {
      // No triggers defined -> Default to ON (unless suppressed)
      isActive = true;
    } else {
      // Triggers defined -> Must be triggered
      isActive = shouldTurnOn;
    }

    // Apply suppression
    if (shouldTurnOff) {
      isActive = false;
    }

    // Update state
    if (loreItem.on !== isActive) {
      loreItem.on = isActive;

      // Track when lore was triggered for auto-expiry
      if (isActive && !loreItem.alwaysOn) {
        loreItem.lastTriggeredIndex = currentPartIndex;
      }

      logger.state_change(`Lore '${loreItem.title}' changed state`, {
        active: isActive,
        triggers: { shouldTurnOn, shouldTurnOff, hasAnyOnTriggersDefined },
      });

      // if (!initialLoad) {
      //   if (isActive) {
      //     addNotification(`📜 Lore discovered: ${loreItem.title}`, "success");
      //   } else {
      //     addNotification(`📜 Lore hidden: ${loreItem.title}`, "info");
      //   }
      // }
    } else if (isActive && !loreItem.alwaysOn && shouldTurnOn) {
      // Refresh lastTriggeredIndex if lore is re-triggered
      loreItem.lastTriggeredIndex = currentPartIndex;
    }
  });
}
