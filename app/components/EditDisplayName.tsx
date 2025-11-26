"use client";

import { useState } from "react";
import { supabase } from "@/app/misc/supabase";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "./DynamicIcon";

interface EditDisplayNameProps {
  currentDisplayName: string | null;
  onSuccess?: () => void;
}

export default function EditDisplayName({
  currentDisplayName,
  onSuccess,
}: EditDisplayNameProps) {
  const { addNotification } = useNotification();
  const [displayName, setDisplayName] = useState(currentDisplayName || "");
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayName.trim()) {
      addNotification("Display name cannot be empty", "warning");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to update your profile", "warning");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/users/${session.user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          display_name: displayName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(
          `${data.error || "Failed to update display name"}`,
          "failure"
        );
        setLoading(false);
        return;
      }

      addNotification("Display name updated successfully", "success");
      setIsEditing(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error updating display name:", error);
      addNotification("Network error. Please try again.", "failure");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(currentDisplayName || "");
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
      >
        <DynamicIcon name="Edit2" className="w-3 h-3" /> Edit name
      </button>
    );
  }

  return (
    <div className="mt-2 bg-blue-900/30 rounded-lg p-3 border border-blue-800/30">
      <form onSubmit={handleSave} className="flex gap-2">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          maxLength={50}
          className="flex-1 bg-blue-950/50 border border-blue-800/30 rounded-lg px-3 py-1.5 text-white text-sm placeholder-blue-200/30 focus:border-blue-600 focus:outline-none"
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          disabled={
            loading || !displayName.trim() || displayName === currentDisplayName
          }
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Save"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="px-3 py-1.5 bg-blue-900/50 text-blue-200 text-sm font-medium rounded-lg hover:bg-blue-900/70 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}
