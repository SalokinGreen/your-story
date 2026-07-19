"use client";

import { DynamicIcon } from "../../components/DynamicIcon";
import { BasicSettingsForm } from "./BasicSettings";

export default function ChatDisplaySettings({
  form,
  onChange,
}: {
  form: Pick<
    BasicSettingsForm,
    "displayName" | "displayAvatar" | "player_name"
  >;
  onChange: (
    updates: Partial<Pick<BasicSettingsForm, "displayName" | "displayAvatar">>,
  ) => void;
}) {
  return (
    <div className="border border-blue-700/40 rounded-lg p-4 bg-blue-900/10">
      <h4 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
        <DynamicIcon name="MessageCircle" className="w-4 h-4" />
        Chat Display Settings
      </h4>
      <p className="text-xs text-blue-200/60 mb-4">
        Customize how your messages appear in the story chat. Leave empty to use
        your account defaults.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-2">
            Display Name
          </label>
          <input
            type="text"
            value={form.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
            placeholder={form.player_name || "Your name"}
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-blue-400/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-2">
            Avatar URL
          </label>
          <input
            type="url"
            value={form.displayAvatar}
            onChange={(e) => onChange({ displayAvatar: e.target.value })}
            placeholder="https://..."
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-blue-400/40"
          />
        </div>
      </div>
      {form.displayAvatar && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-blue-200/60">Preview:</span>
          <img
            src={form.displayAvatar}
            alt="Avatar preview"
            className="w-10 h-10 rounded-full object-cover border-2 border-purple-500/50"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}

