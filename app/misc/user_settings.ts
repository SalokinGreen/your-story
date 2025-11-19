import { SupabaseClient } from "@supabase/supabase-js";

export interface UserSettings {
  user_id: string;
  byok_enabled: boolean;
  is_subscriber: boolean;
  save_stories_locally?: boolean;
  custom_model_config?: {
    modelId?: string;
    name?: string;
    contextSize?: number;
    maxOutputTokens?: number;
    inputPrice?: number; // per 1M tokens
    outputPrice?: number; // per 1M tokens
  };
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
  const { error } = await supabase.from("user_settings").upsert({
    user_id: userId,
    ...settings,
    updated_at: new Date().toISOString(),
  });

  return { error };
}
