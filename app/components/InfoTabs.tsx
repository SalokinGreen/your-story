"use client";

import { StaticIcon } from "./StaticIcon";

interface KeyRequirement {
  icon: string;  title: string;
  provider: string;
  providerUrl: string;
  description: string;
}

const KEY_REQUIREMENTS: KeyRequirement[] = [
  {
    icon: "Key",    title: "Story Generation",
    provider: "OpenRouter",
    providerUrl: "https://openrouter.ai/keys",
    description:
      "One OpenRouter key runs the default GM, narrator and helper models. Prefer another provider? Pick any model you like in Settings - every stage is yours to tune.",
  },
  {
    icon: "FileText",    title: "PDF Import & Voice Input",
    provider: "Mistral",
    providerUrl: "https://console.mistral.ai/api-keys",
    description:
      "Importing a PDF into your library and using the microphone to talk to the GM both run on Mistral's OCR and speech-to-text.",
  },
  {
    icon: "Volume2",    title: "Voice Narration",
    provider: "Cartesia or ElevenLabs",
    providerUrl: "https://elevenlabs.io/app/settings/api-keys",
    description:
      "Text-to-speech narration is powered by Cartesia Sonic-3.6 or ElevenLabs voice models.",
  },
];

/**
 * Landing page explainer for the BYOK model: which feature needs which
 * provider's API key. Replaces the old paid-tier model preset showcase.
 */
export default function InfoTabs() {
  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="bg-ys-accent/15 rounded-xl border border-ys-accent/30 p-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <StaticIcon name="Key" className="w-4 h-4 text-ys-muted" />
          <h2 className="text-sm font-medium text-ys-text uppercase tracking-wider">
            Bring Your Own Key
          </h2>
        </div>
        <p className="text-center text-sm text-ys-muted mb-4 max-w-lg mx-auto">
          Endless Adventure runs entirely on API keys you provide - no accounts, no
          subscriptions. Keys are stored in your browser and only sent
          directly to power the feature that needs them.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          {KEY_REQUIREMENTS.map((req) => (
            <div
              key={req.title}
              className="ys-card overflow-hidden w-full sm:w-64"
            >
              <div className={`h-2 bg-ys-accent`} />
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-lg bg-ys-accent flex items-center justify-center shadow-lg shrink-0`}
                  >
                    <StaticIcon
                      name={req.icon}
                      className="w-5 h-5 text-ys-on-accent"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-ys-text text-sm">
                      {req.title}
                    </h3>
                    <a
                      href={req.providerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ys-muted hover:text-ys-text transition-colors"
                    >
                      {req.provider}
                    </a>
                  </div>
                </div>
                <p className="text-sm text-ys-muted">{req.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center pt-4">
          <p className="text-xs text-ys-muted">
            <StaticIcon name="Settings" className="w-3 h-3 inline mr-1" />
            Add your keys anytime from Settings in the story menu - only add
            the ones for features you plan to use.
          </p>
        </div>
      </div>
    </div>
  );
}
