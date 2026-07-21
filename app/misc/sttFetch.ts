/**
 * Drop-in replacement for fetch("/api/stt/transcribe", {body: formData}) -
 * see providerFetch.ts for the pattern this follows.
 */

import { isStandalone } from "./standalone";
import { transcribeAudio } from "./sttCall";

export async function sttFetch(formData: FormData): Promise<Response> {
  if (!isStandalone()) {
    return fetch("/api/stt/transcribe", { method: "POST", body: formData });
  }

  const audioFile = formData.get("audio") as File | null;
  const mistralKey = formData.get("mistralKey") as string | null;
  const result = await transcribeAudio(audioFile, mistralKey);

  const status = "error" in result ? result.status : 200;
  return new Response(JSON.stringify(result), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
