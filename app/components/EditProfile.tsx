"use client";

import { useState } from "react";
import { supabase } from "@/app/misc/supabase";
import { useNotification } from "@/app/misc/NotificationContext";
import { DynamicIcon } from "./DynamicIcon";

interface ProfileData {
  avatar_url?: string;
  bio?: string;
}

interface EditProfileProps {
  userId: string;
  currentProfile: ProfileData;
  onSuccess?: () => void;
}

export default function EditProfile({
  userId,
  currentProfile,
  onSuccess,
}: EditProfileProps) {
  const { addNotification } = useNotification();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [bio, setBio] = useState(currentProfile.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(currentProfile.avatar_url || "");

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      addNotification("Please upload an image file", "warning");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      addNotification("Image must be less than 2MB", "warning");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const timestamp = Date.now();
      const fileName = `${userId}/avatar-${timestamp}.${fileExt}`;

      // Delete old avatar if exists
      if (avatarUrl) {
        try {
          // Extract the full path from the URL
          const urlParts = avatarUrl.split("/avatars/");
          if (urlParts.length > 1) {
            const oldPath = urlParts[1].split("?")[0]; // Remove query params
            await supabase.storage.from("avatars").remove([oldPath]);
          }
        } catch (error) {
          console.warn("Could not delete old avatar:", error);
          // Continue anyway - not critical
        }
      }

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL with cache-busting query param
      const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);

      const newAvatarUrl = `${data.publicUrl}?t=${timestamp}`;
      setAvatarUrl(newAvatarUrl);
      addNotification("Avatar uploaded", "success");

      // Reset the file input so the same file can be selected again if needed
      e.target.value = "";
    } catch (error) {
      console.error("Error uploading avatar:", error);
      addNotification("Failed to upload avatar", "failure");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in", "warning");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/profiles/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          avatar_url: avatarUrl || null,
          bio: bio.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification(
          `${data.error || "Failed to update profile"}`,
          "failure"
        );
        setLoading(false);
        return;
      }

      addNotification("Profile updated", "success");
      setIsEditing(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error updating profile:", error);
      addNotification("Network error", "failure");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setBio(currentProfile.bio || "");
    setAvatarUrl(currentProfile.avatar_url || "");
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="px-3 py-1 text-sm bg-gray-200 dark:bg-blue-950 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
      >
        <DynamicIcon name="Edit" className="w-4 h-4" /> Edit Profile
      </button>
    );
  }

  return (
    <div className="border-2 border-blue-600 dark:border-blue-400 p-4 bg-blue-50 dark:bg-blue-950 space-y-4">
      <h3 className="text-lg font-bold">Edit Profile</h3>
      <form onSubmit={handleSave} className="space-y-4">
        {/* Avatar Upload */}
        <div>
          <label className="block font-semibold mb-2">Avatar</label>
          <div className="flex items-center gap-4">
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt="Avatar preview"
                className="w-16 h-16 rounded-full object-cover border-2 border-black dark:border-white"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              disabled={uploading || loading}
              className="text-sm"
            />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Max 2MB. JPG, PNG, or GIF.
          </p>
        </div>

        {/* Bio */}
        <div>
          <label htmlFor="bio" className="block font-semibold mb-2">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself..."
            maxLength={500}
            rows={4}
            className="w-full border-2 border-blue-600 dark:border-blue-400 p-2 bg-white dark:bg-black"
            disabled={loading}
          />
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {bio.length}/500 characters
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || uploading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading || uploading}
            className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 font-semibold hover:bg-gray-400 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
