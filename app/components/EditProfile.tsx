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
        className="p-1.5 bg-blue-950/80 hover:bg-blue-900/80 text-blue-200 rounded-lg border border-blue-800/30 transition-colors"
        title="Edit Profile"
      >
        <DynamicIcon name="Settings" className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-blue-950 rounded-xl border border-blue-800/30 p-4 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Edit Profile</h3>
          <button
            onClick={handleCancel}
            className="p-1 text-blue-200/40 hover:text-blue-200"
          >
            <DynamicIcon name="X" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Avatar Upload */}
          <div>
            <label className="block text-sm font-medium text-blue-200/60 mb-2">
              Avatar
            </label>
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar preview"
                  className="w-14 h-14 rounded-full object-cover border-2 border-blue-600"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-blue-900/50 border-2 border-blue-800/30 flex items-center justify-center">
                  <DynamicIcon
                    name="User"
                    className="w-6 h-6 text-blue-200/40"
                  />
                </div>
              )}
              <label className="flex-1">
                <span className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors inline-flex items-center gap-1">
                  <DynamicIcon name="Upload" className="w-4 h-4" />
                  {uploading ? "Uploading..." : "Upload"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  disabled={uploading || loading}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-xs text-blue-200/30 mt-1">Max 2MB</p>
          </div>

          {/* Bio */}
          <div>
            <label
              htmlFor="bio"
              className="block text-sm font-medium text-blue-200/60 mb-2"
            >
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              maxLength={500}
              rows={3}
              className="w-full bg-blue-900/30 border border-blue-800/30 rounded-lg p-2.5 text-white placeholder-blue-200/30 focus:border-blue-600 focus:outline-none text-sm"
              disabled={loading}
            />
            <p className="text-xs text-blue-200/30 mt-1">{bio.length}/500</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading || uploading}
              className="flex-1 px-4 py-2 bg-blue-900/30 text-blue-200 font-medium rounded-lg border border-blue-800/30 hover:bg-blue-900/50 disabled:opacity-50 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors text-sm"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
