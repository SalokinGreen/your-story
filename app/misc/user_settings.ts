import { SupabaseClient } from "@supabase/supabase-js";

export interface CustomModel {
  id: string; // Unique ID for this custom model
  modelId: string; // OpenRouter model ID
  name: string;
  contextSize: number;
  maxOutputTokens: number;
  inputPrice?: number; // Price per million input tokens (optional, defaults to 0 for BYOK)
  outputPrice?: number; // Price per million output tokens (optional, defaults to 0 for BYOK)
}

export interface UserSettings {
  user_id: string;
  byok_enabled: boolean;
  is_subscriber: boolean;
  save_stories_locally?: boolean;
  custom_models?: CustomModel[]; // Array of custom models
}

export async function getUserSettings(
  userId: string,
  supabase: SupabaseClient
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user settings:", error);
    return null;
  }

  if (!data) {
    // Create new settings if not found
    const { data: newData, error: insertError } = await supabase
      .from("user_settings")
      .insert([{ user_id: userId }])
      .select()
      .single();

    if (insertError) {
      console.error("Error creating user settings:", insertError);
      return null;
    }
    return newData as UserSettings;
  }

  return data as UserSettings;
}

export async function updateUserSettings(
  userId: string,
  settings: Partial<UserSettings>,
  supabase: SupabaseClient
): Promise<{ error: any }> {
  // First check if settings exist
  const { data: existingSettings } = await supabase
    .from("user_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  // Clean up undefined values and prepare the update object
  const updateData: any = {};

  // Only include defined fields (excluding user_id for update)
  if (settings.byok_enabled !== undefined) {
    updateData.byok_enabled = settings.byok_enabled;
  }
  if (settings.is_subscriber !== undefined) {
    updateData.is_subscriber = settings.is_subscriber;
  }
  if (settings.save_stories_locally !== undefined) {
    updateData.save_stories_locally = settings.save_stories_locally;
  }
  if (settings.custom_models !== undefined) {
    // Convert undefined to empty array for JSONB field
    updateData.custom_models = settings.custom_models || [];
  }

  let error;
  if (existingSettings) {
    // Update existing record
    const result = await supabase
      .from("user_settings")
      .update(updateData)
      .eq("user_id", userId);
    error = result.error;
  } else {
    // Insert new record
    const result = await supabase
      .from("user_settings")
      .insert({ user_id: userId, ...updateData });
    error = result.error;
  }

  if (error) {
    console.error("Error updating user settings:", error);

    // Check if it's a schema/table issue
    if (error.code === "PGRST204" || error.code === "42P01") {
      console.error(
        "⚠️  The user_settings table may not exist. Please run the migration:",
        "\n\n  Run this SQL in your Supabase SQL Editor:",
        "\n  docs/user_settings.sql\n"
      );
    }
  }

  return { error };
}
