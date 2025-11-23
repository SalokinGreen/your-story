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
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsEditing(true)}
          className="px-3 py-1 text-sm bg-gray-200 dark:bg-blue-950 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <DynamicIcon name="Edit" className="w-4 h-4" /> Edit Name
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-blue-600 dark:border-blue-400 p-4 bg-blue-50 dark:bg-blue-950">
      <h3 className="text-lg font-bold mb-3">Edit Display Name</h3>
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter display name"
          maxLength={50}
          className="border-2 border-blue-600 dark:border-blue-400 p-2 bg-white dark:bg-black"
          disabled={loading}
          autoFocus
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={
              loading ||
              !displayName.trim() ||
              displayName === currentDisplayName
            }
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 font-semibold hover:bg-gray-400 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Max 50 characters
        </p>
      </form>
    </div>
  );
}
