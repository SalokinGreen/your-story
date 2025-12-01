/**
 * API Keys Management API
 *
 * Handles encrypted storage and retrieval of user API keys.
 * Keys are encrypted using AES-256-GCM before storage.
 *
 * GET - Retrieve decrypted API keys
 * PATCH - Update specific keys
 * PUT - Replace all keys
 * DELETE - Remove all stored keys
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

// Encryption config
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Get encryption key from env (should be 32 bytes / 64 hex chars)
function getEncryptionKey(): Buffer {
  const key = process.env.API_KEYS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("API_KEYS_ENCRYPTION_KEY not configured");
  }
  // If it's a hex string, convert to buffer
  if (key.length === 64) {
    return Buffer.from(key, "hex");
  }
  // Otherwise hash it to get 32 bytes
  return crypto.createHash("sha256").update(key).digest();
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Format: iv:tag:encrypted
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, encrypted] = encryptedData.split(":");

  if (!ivHex || !tagHex || !encrypted) {
    throw new Error("Invalid encrypted data format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

interface APIKeys {
  openRouterKey?: string;
  deepseekKey?: string;
  novelaiKey?: string;
  speechifyKey?: string;
}

async function getUser(req: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

// GET - Retrieve decrypted API keys
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("user_api_keys")
      .select("encrypted_keys")
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      // No keys stored yet - return empty
      return NextResponse.json({});
    }

    try {
      const decrypted = decrypt(data.encrypted_keys);
      const keys = JSON.parse(decrypted) as APIKeys;
      return NextResponse.json(keys);
    } catch {
      // Decryption failed - keys may be corrupted
      return NextResponse.json({});
    }
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH - Update specific keys
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updates = (await req.json()) as Partial<APIKeys>;

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get existing keys
    const { data: existing } = await supabase
      .from("user_api_keys")
      .select("encrypted_keys")
      .eq("user_id", user.id)
      .single();

    let currentKeys: APIKeys = {};
    if (existing?.encrypted_keys) {
      try {
        currentKeys = JSON.parse(decrypt(existing.encrypted_keys));
      } catch {
        // Ignore decryption errors
      }
    }

    // Merge updates
    const newKeys = { ...currentKeys, ...updates };
    const encrypted = encrypt(JSON.stringify(newKeys));

    // Upsert
    const { error } = await supabase.from("user_api_keys").upsert(
      {
        user_id: user.id,
        encrypted_keys: encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Error saving API keys:", error);
      return NextResponse.json(
        { error: "Failed to save keys" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating API keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Replace all keys
export async function PUT(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = (await req.json()) as APIKeys;

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const encrypted = encrypt(JSON.stringify(keys));

    const { error } = await supabase.from("user_api_keys").upsert(
      {
        user_id: user.id,
        encrypted_keys: encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Error saving API keys:", error);
      return NextResponse.json(
        { error: "Failed to save keys" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error replacing API keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Remove all stored keys
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from("user_api_keys")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting API keys:", error);
      return NextResponse.json(
        { error: "Failed to delete keys" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting API keys:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
