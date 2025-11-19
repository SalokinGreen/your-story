/**
 * End-to-end encryption utilities for story data
 * Uses user's email+password to derive encryption key via PBKDF2
 * Encrypts story data with AES-256-GCM for confidentiality and integrity
 */

// Encryption algorithm configuration
const ENCRYPTION_VERSION = 1;
const PBKDF2_ITERATIONS = 600000; // OWASP recommendation for 2024+
const KEY_LENGTH = 256; // AES-256
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Derives a cryptographic key from user's email and password
 * Uses PBKDF2 with high iteration count for security
 */
async function deriveKey(
  email: string,
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // Combine email and password to create the base key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${email}:${password}`),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // Derive AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts story data using the user's credentials
 * Returns encrypted data as base64 string with metadata
 */
export async function encryptStoryData(
  storyData: any,
  email: string,
  password: string
): Promise<{
  encrypted: true;
  version: number;
  data: string; // base64 encoded encrypted data
  salt: string; // base64 encoded salt
  iv: string; // base64 encoded IV
}> {
  try {
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive encryption key from credentials
    const key = await deriveKey(email, password, salt);

    // Convert story data to JSON string, then to bytes
    const jsonString = JSON.stringify(storyData);
    const data = new TextEncoder().encode(jsonString);

    // Encrypt with AES-GCM (provides both confidentiality and integrity)
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      data
    );

    // Convert to base64 for storage
    return {
      encrypted: true,
      version: ENCRYPTION_VERSION,
      data: arrayBufferToBase64(encryptedData),
      salt: arrayBufferToBase64(salt.buffer),
      iv: arrayBufferToBase64(iv.buffer),
    };
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt story data");
  }
}

/**
 * Decrypts story data using the user's credentials
 * Returns the original story data object
 */
export async function decryptStoryData(
  encryptedPayload: {
    encrypted: true;
    version: number;
    data: string;
    salt: string;
    iv: string;
  },
  email: string,
  password: string
): Promise<any> {
  try {
    // Check encryption version compatibility
    if (encryptedPayload.version !== ENCRYPTION_VERSION) {
      throw new Error(
        `Unsupported encryption version: ${encryptedPayload.version}`
      );
    }

    // Convert base64 back to binary
    const encryptedData = base64ToArrayBuffer(encryptedPayload.data);
    const salt = base64ToArrayBuffer(encryptedPayload.salt);
    const iv = base64ToArrayBuffer(encryptedPayload.iv);

    // Derive decryption key from credentials
    const key = await deriveKey(email, password, new Uint8Array(salt));

    // Decrypt with AES-GCM
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      encryptedData
    );

    // Convert bytes back to JSON object
    const jsonString = new TextDecoder().decode(decryptedData);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Decryption error:", error);
    // Decryption failure typically means wrong password or corrupted data
    throw new Error(
      "Failed to decrypt story data. Invalid credentials or corrupted data."
    );
  }
}

/**
 * Checks if story data is encrypted
 */
export function isEncrypted(storyData: any): storyData is {
  encrypted: true;
  version: number;
  data: string;
  salt: string;
  iv: string;
} {
  return (
    storyData &&
    typeof storyData === "object" &&
    storyData.encrypted === true &&
    typeof storyData.version === "number" &&
    typeof storyData.data === "string" &&
    typeof storyData.salt === "string" &&
    typeof storyData.iv === "string"
  );
}

/**
 * Validates that user credentials are available for encryption/decryption
 */
export function validateCredentials(
  email: string | null | undefined,
  password: string | null | undefined
): { valid: boolean; error?: string } {
  if (!email || !password) {
    return {
      valid: false,
      error: "Email and password are required for encryption",
    };
  }
  if (password.length < 8) {
    return {
      valid: false,
      error: "Password must be at least 8 characters for encryption",
    };
  }
  return { valid: true };
}

// Utility: Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Utility: Convert base64 string to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Test function to verify encryption/decryption works correctly
 * Should only be used in development
 */
export async function testEncryption() {
  const testData = {
    story_name: "Test Story",
    player_name: "Hero",
    secret: "This is secret data that should be encrypted",
  };

  const email = "test@example.com";
  const password = "SecurePassword123!";

  console.log("Original data:", testData);

  // Encrypt
  const encrypted = await encryptStoryData(testData, email, password);
  console.log("Encrypted:", encrypted);

  // Decrypt with correct credentials
  const decrypted = await decryptStoryData(encrypted, email, password);
  console.log("Decrypted:", decrypted);

  // Verify integrity
  const match = JSON.stringify(testData) === JSON.stringify(decrypted);
  console.log("Data integrity verified:", match);

  // Test wrong password (should fail)
  try {
    await decryptStoryData(encrypted, email, "WrongPassword");
    console.error("ERROR: Decryption should have failed with wrong password!");
  } catch (error) {
    console.log("✓ Correctly rejected wrong password");
  }

  return match;
}
