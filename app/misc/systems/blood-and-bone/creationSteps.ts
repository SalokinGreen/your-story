/**
 * Blood & Bone's character-creation steps for step-by-step session zero: one
 * choice per tag (docs/session-zero-detail-design.md 3.1). Starting Stress is
 * a rule, not a step; the burden's hint says to state it. Original wording
 * (decision 3).
 */
import type { CreationStep } from "../../setupSteps";

const step = (
  id: string,
  label: string,
  hint: string,
  kind: "choice" | "creative" = "choice",
): CreationStep => ({
  id,
  label,
  group: "character",
  scope: "player",
  hint,
  kind,
});

export const BLOOD_AND_BONE_CREATION_STEPS: CreationStep[] = [
  step(
    "kind",
    "Kind",
    "Which Kind they are. Say what each Kind means in play: its hunger or weakness, and how it recovers.",
  ),
  step(
    "archetype",
    "Archetype",
    "One of the chosen Kind's Archetypes (two in its note; the seven original Kinds have a third in B&B — <Kind>: The <Archetype>): how they carry what they are.",
  ),
  step(
    "stats",
    "Stats",
    "Spread 3, 2, 2, 1, 1 over Nerve, Heart, Bone, Shadow and Wits. Say what each stat covers.",
  ),
  step(
    "vow",
    "Vow",
    "Their driving goal and its rank (Troublesome, Dangerous, Formidable, Extreme).",
    "creative",
  ),
  step(
    "connections",
    "Connections",
    "Two connections, both under this tag: who or what each is, its rank (one Steady and one Weak, or two Weak) and why it still matters.",
    "creative",
  ),
  step(
    "burden",
    "Burden",
    'Whether they take one starting burden, or none ("none" counts). If so: who holds it and which benefit they take. Then tell them their starting Stress: 2, or 1 if the benefit is lower Stress.',
  ),
  step("power", "Power", "One Power from the Kind's note; they get its first ability free."),
  step(
    "path",
    "Path",
    "One Path, what they were before this; they get its first ability free.",
  ),
  step(
    "gear",
    "Gear and resources",
    "Two or three pieces of gear or resources that fit the Kind and the Path.",
    "creative",
  ),
];
