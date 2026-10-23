// How the composer's draft takes a voice transcript. Pure, so it can be tested
// without a DOM.

/** The draft with the transcript added: after a space when there is text already. */
export function appendTranscript(draft: string, transcript: string): string {
  const add = transcript.trim();
  if (!add) return draft;
  if (draft.trim() === "") return add;
  return /\s$/.test(draft) ? `${draft}${add}` : `${draft} ${add}`;
}

/** Whether a draft still counts as voice: it must hold text, or typing it away resets it. */
export function stillVoice(isVoice: boolean, draft: string): boolean {
  return isVoice && draft.trim() !== "";
}
