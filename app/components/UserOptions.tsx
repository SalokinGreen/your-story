import { useEffect, useState } from "react";
import { useAuth } from "@/app/misc/AuthContext";
import { supabase } from "@/app/misc/supabase";
import { getUserSettings } from "@/app/misc/user_settings";
import { DynamicIcon } from "./DynamicIcon";

export default function UserOptions() {
  const { user } = useAuth();
  const [saveLocally, setSaveLocally] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      if (!user) return;
      const settings = await getUserSettings(user.id, supabase);

      if (settings) {
        setSaveLocally(settings.save_stories_locally || false);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSaveLocally = async () => {
    const newValue = !saveLocally;
    setSaveLocally(newValue); // Optimistic update

    try {
      const { error } = await supabase
        .from("user_settings")
        .update({ save_stories_locally: newValue })
        .eq("user_id", user?.id);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating settings:", error);
      setSaveLocally(!newValue); // Revert on error
    }
  };

  if (!user) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
        <DynamicIcon name="Settings" className="w-6 h-6" /> User Options
      </h2>

      <div className="space-y-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Offline Mode
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Save stories locally to your device instead of the cloud.
              </p>
            </div>
            <button
              onClick={toggleSaveLocally}
              disabled={loading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                saveLocally ? "bg-purple-600" : "bg-gray-200 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  saveLocally ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
