/**
 * Human-friendly, present-tense labels for GM tool calls - used by
 * story.tsx's TimelineEntryPill (the per-step tool/thinking checklist shown
 * inline in every AI message) so players see "Rolling dice" instead of a
 * raw tool name like "formula_roll".
 */
const TOOL_LABELS: Record<string, string> = {
  // Dice / checks
  formula_roll: "Rolling dice",
  ask_for_roll: "Waiting for your roll",
  ask_question: "Asking you a question",
  opposed_formula: "Rolling opposed check",
  formula_challenge_check: "Rolling challenge check",
  npc_roll: "Rolling for NPC",
  calculate: "Calculating",
  fate_question: "Consulting fate",
  roll_table: "Rolling on a table",
  generate_name: "Rolling up a name",
  start_challenge: "Starting a challenge",
  cancel_challenge: "Cancelling the challenge",
  take_rest: "Resting",

  // Notes / memory lookup
  read_notes: "Reading notes",
  search_notes: "Searching notes",
  search_memory: "Searching memory",
  get_game_state: "Checking game state",
  create_note: "Creating a note",
  delete_note: "Deleting a note",
  edit_note: "Updating a note",
  edit_lore_replace: "Editing a note",
  edit_lore_append: "Editing a note",
  edit_lore_prepend: "Editing a note",
  edit_lore_insert: "Editing a note",
  merge_lore: "Merging notes",
  duplicate_lore: "Duplicating a note",
  add_memory: "Recording a memory",

  // Combat
  start_combat: "Starting combat",
  add_combatant: "Adding combatant",
  remove_combatant: "Removing combatant",
  update_combatant_stat: "Updating combatant",
  toggle_combatant_condition: "Updating condition",
  advance_turn: "Advancing turn",
  end_combat: "Ending combat",

  // NPCs
  add_npc: "Adding NPC",
  update_npc: "Updating NPC",
  remove_npc: "Removing NPC",
  npc_reaction: "NPC reacting",

  // Timers
  manage_timer: "Managing timer",

  // Goals / threads
  create_goal: "Creating goal",
  update_goal: "Updating goal",
  complete_goal: "Completing goal",
  fail_goal: "Failing goal",
  delete_goal: "Removing goal",
  create_thread: "Opening story thread",
  update_thread: "Updating story thread",
  resolve_thread: "Resolving story thread",
  abandon_thread: "Abandoning story thread",

  // Flow control
  request_continuation: "Continuing",
  end_gm_thinking: "Wrapping up",
  start_game: "Starting the game",
};

/** Present-tense label for a tool call, for a live-progress indicator. */
export function getToolProgressLabel(toolName: string): string {
  if (TOOL_LABELS[toolName]) return TOOL_LABELS[toolName];
  // Fallback: prettify unknown/future tool names ("some_new_tool" -> "Some new tool")
  const words = toolName.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
