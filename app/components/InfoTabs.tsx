"use client";

import { StaticIcon } from "./StaticIcon";

interface KeyRequirement {
  icon: string;
  gradient: string;
  title: string;
  provider: string;
  providerUrl: string;
  description: string;
}

const KEY_REQUIREMENTS: KeyRequirement[] = [
  {
    icon: "Key",
    gradient: "from-blue-500 to-purple-600",
    title: "Story Generation",
    provider: "DeepSeek or OpenRouter",
    providerUrl: "https://openrouter.ai/keys",
    description:
      "Pick any model you like and configure it in Settings - the story, GM, and choices stages are all yours to tune.",
  },
  {
    icon: "FileText",
    gradient: "from-amber-500 to-orange-600",
    title: "PDF Import & Voice Input",
    provider: "Mistral",
    providerUrl: "https://console.mistral.ai/api-keys",
    description:
      "Importing a PDF into your library and using the microphone to talk to the GM both run on Mistral's OCR and speech-to-text.",
  },
  {
    icon: "Volume2",
    gradient: "from-emerald-500 to-teal-600",
    title: "Voice Narration",
    provider: "DeepInfra",
    providerUrl: "https://deepinfra.com/dash/api_keys",
    description:
      "Text-to-speech narration is powered by DeepInfra's Kokoro and Orpheus voice models.",
  },
];

/**
 * Landing page explainer for the BYOK model: which feature needs which
 * provider's API key. Replaces the old paid-tier model preset showcase.
 */
export default function InfoTabs() {
  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="bg-blue-950/30 rounded-xl border border-blue-800/30 p-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <StaticIcon name="Key" className="w-4 h-4 text-blue-300" />
          <h2 className="text-sm font-medium text-blue-100 uppercase tracking-wider">
            Bring Your Own Key
          </h2>
        </div>
        <p className="text-center text-sm text-blue-200/60 mb-4 max-w-lg mx-auto">
          Your Story runs entirely on API keys you provide - no accounts, no
          subscriptions. Keys are stored in your browser and only sent
          directly to power the feature that needs them.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          {KEY_REQUIREMENTS.map((req) => (
            <div
              key={req.title}
              className="bg-blue-950/50 rounded-xl border border-blue-800/30 overflow-hidden w-full sm:w-64"
            >
              <div className={`h-2 bg-linear-to-r ${req.gradient}`} />
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-lg bg-linear-to-br ${req.gradient} flex items-center justify-center shadow-lg shrink-0`}
                  >
                    <StaticIcon
                      name={req.icon}
                      className="w-5 h-5 text-white"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      {req.title}
                    </h3>
                    <a
                      href={req.providerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-300/70 hover:text-blue-200 transition-colors"
                    >
                      {req.provider}
                    </a>
                  </div>
                </div>
                <p className="text-sm text-blue-200/70">{req.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center pt-4">
          <p className="text-xs text-blue-200/40">
            <StaticIcon name="Settings" className="w-3 h-3 inline mr-1" />
            Add your keys anytime from Settings in the story menu - only add
            the ones for features you plan to use.
          </p>
        </div>
      </div>
    </div>
  );
}
