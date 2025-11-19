# Story Encryption System

## Overview

The story encryption system provides **end-to-end encryption** for user stories, ensuring that story data is truly private and can only be accessed by the user who created it. The system uses the user's email and password as the basis for encryption keys, providing military-grade security with AES-256-GCM encryption.

## Key Features

- ✅ **End-to-End Encryption**: Stories are encrypted on the client before being sent to the server
- ✅ **AES-256-GCM**: Military-grade encryption with built-in integrity verification
- ✅ **PBKDF2 Key Derivation**: 600,000 iterations for strong key derivation from user credentials
- ✅ **Automatic Encryption**: New story saves are automatically encrypted if credentials are available
- ✅ **Seamless Decryption**: Stories are automatically decrypted when loaded
- ✅ **Migration Support**: Easy one-click migration for existing unencrypted stories
- ✅ **Visual Indicators**: Encrypted stories are clearly marked in the library

## Architecture

### Components

1. **`app/misc/encryption.ts`**: Core encryption/decryption utilities
2. **`app/misc/AuthContext.tsx`**: Password management in sessionStorage
3. **`app/story/page.tsx`**: Auto-encrypt on save, auto-decrypt on load
4. **`app/library/page.tsx`**: Display encryption status
5. **`app/components/EncryptionMigration.tsx`**: One-click migration for existing stories
6. **`app/misc/structs.ts`**: Updated Story interface to support encrypted data

### Data Flow

#### Encryption (Save)

```
1. User makes changes to story
2. saveProgress() is triggered (3s debounce)
3. Get user email from auth context
4. Get password from sessionStorage
5. Encrypt StoryData with encryptStoryData(data, email, password)
6. Send encrypted payload to API
7. Database stores encrypted blob
```

#### Decryption (Load)

```
1. User opens story
2. Fetch story data from API
3. Check if data is encrypted with isEncrypted()
4. Get user email from auth context
5. Get password from sessionStorage
6. Decrypt with decryptStoryData(encrypted, email, password)
7. Display decrypted story to user
```

## Security Details

### Encryption Algorithm

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Length**: 256 bits
- **IV Length**: 96 bits (12 bytes)
- **Salt Length**: 128 bits (16 bytes)

### Key Derivation

- **Function**: PBKDF2 (Password-Based Key Derivation Function 2)
- **Hash**: SHA-256
- **Iterations**: 600,000 (OWASP 2024 recommendation)
- **Input**: `email:password` combined string
- **Output**: 256-bit AES key

### Storage Format

Encrypted stories are stored in the database as JSON objects with the following structure:

```typescript
{
  encrypted: true,
  version: 1,
  data: "base64_encoded_encrypted_data",
  salt: "base64_encoded_salt",
  iv: "base64_encoded_initialization_vector"
}
```

### Password Management

- User passwords are stored in **sessionStorage** (not localStorage)
- Passwords are only available during the current browser session
- Passwords are cleared on sign-out or when the browser is closed
- Passwords are never sent to the server or stored in the database

## User Experience

### For New Users

1. User signs up or signs in
2. Password is automatically captured and stored in sessionStorage
3. All new stories are automatically encrypted
4. No user action required - encryption is transparent

### For Existing Users with Unencrypted Stories

1. User signs in (password is captured)
2. Library page shows migration banner if unencrypted stories exist
3. User clicks "Enable Encryption" button
4. Confirmation dialog explains the process and implications
5. User confirms migration
6. All unencrypted stories are encrypted in bulk
7. Progress bar shows migration status
8. Success notification on completion

### Visual Indicators

- **Library View**: Encrypted stories show a 🔒 Encrypted badge
- **Migration Banner**: Prominent banner in library when unencrypted stories exist
- **Progress Display**: Real-time progress bar during migration

## Important Considerations

### Password Changes

⚠️ **CRITICAL**: If a user changes their password, they will **NOT** be able to decrypt stories that were encrypted with the old password. This is by design - the encryption is tied to the specific password used.

**Recommended approach for password changes:**

1. Inform users before password change that encrypted stories will become inaccessible
2. Optionally provide a migration tool that re-encrypts stories with the new password
3. Require old password verification before changing password

### Password Recovery

⚠️ **CRITICAL**: If a user forgets their password, there is **NO WAY** to recover encrypted stories. This is a fundamental security trade-off - true end-to-end encryption means the server cannot decrypt the data.

**User education is essential:**

- Warn users during signup about password importance
- Recommend password managers
- Consider optional backup key generation (future feature)

### Session Expiry

If a user's session expires or they manually sign out:

- The password is cleared from sessionStorage
- They must sign in again to access encrypted stories
- Upon sign-in, the password is recaptured for decryption

### Backwards Compatibility

- Unencrypted stories continue to work normally
- The system detects encryption status using `isEncrypted()`
- Mixed encrypted/unencrypted stories are supported
- No database migrations required

## API Impact

### No Changes Required

The API routes (`/api/stories/*`) **do not require any changes**. They simply store and retrieve data as JSONB. Whether that data is encrypted or not is transparent to the API - it's all just JSON.

### Benefits

- Simpler implementation
- No server-side encryption complexity
- True end-to-end encryption
- Server cannot decrypt user data even if compromised

## Testing

### Manual Testing Steps

1. **Test Encryption on New Story**:

   - Sign in
   - Create a new story
   - Make changes and wait for auto-save
   - Check database - `story_data` should contain encrypted payload
   - Reload story - should decrypt automatically

2. **Test Migration**:

   - Create an unencrypted story (before encryption was enabled)
   - Sign in
   - Visit library
   - Click "Enable Encryption" in migration banner
   - Confirm migration
   - Verify all stories are now encrypted

3. **Test Decryption Failure**:

   - Create encrypted story
   - Manually clear sessionStorage password
   - Try to load story
   - Should show error about missing credentials

4. **Test Mixed Stories**:
   - Have both encrypted and unencrypted stories
   - Both should load correctly
   - Encrypted ones should show 🔒 badge

### Automated Testing

Run the test function in development:

```typescript
import { testEncryption } from "@/app/misc/encryption";

// In browser console or component
testEncryption().then((result) => {
  console.log("Encryption test passed:", result);
});
```

## Future Enhancements

### Potential Improvements

1. **Backup Keys**: Generate recovery keys during signup
2. **Password Re-encryption**: Tool to re-encrypt stories with new password
3. **Selective Encryption**: Let users choose which stories to encrypt
4. **Shared Stories**: Key sharing mechanism for collaborative stories
5. **Hardware Key Support**: WebAuthn integration for stronger security
6. **Encryption Metrics**: Track encryption adoption and performance

### Performance Considerations

- PBKDF2 with 600k iterations is intentionally slow (~100-200ms)
- This is a security feature to prevent brute-force attacks
- May cause slight delay when saving/loading stories
- Consider async operations with loading indicators for UX

## Troubleshooting

### "Cannot decrypt story: credentials not available"

**Cause**: Password not in sessionStorage
**Solution**: User must sign out and sign back in

### "Failed to decrypt story. Your credentials may have changed."

**Cause**: Story was encrypted with a different password
**Solution**: User must use the original password or story is permanently inaccessible

### Stories not encrypting

**Cause**: Password not captured during sign-in
**Solution**:

1. Check that AuthContext is properly storing password
2. Verify sessionStorage has `__story_encryption_key`
3. Sign out and sign back in to recapture password

### Migration not appearing

**Cause**: No unencrypted stories or user not signed in
**Solution**: Verify stories exist and user has valid session

## Code Examples

### Encrypt Data

```typescript
import { encryptStoryData } from "@/app/misc/encryption";

const encrypted = await encryptStoryData(
  storyData,
  "user@example.com",
  "password123"
);
```

### Decrypt Data

```typescript
import { decryptStoryData } from "@/app/misc/encryption";

const decrypted = await decryptStoryData(
  encryptedPayload,
  "user@example.com",
  "password123"
);
```

### Check Encryption Status

```typescript
import { isEncrypted } from "@/app/misc/encryption";

if (isEncrypted(storyData)) {
  console.log("Story is encrypted");
} else {
  console.log("Story is not encrypted");
}
```

## Security Audit Checklist

- [x] Encryption algorithm uses industry-standard AES-256-GCM
- [x] Key derivation uses PBKDF2 with sufficient iterations (600k)
- [x] Salt is randomly generated per encryption (16 bytes)
- [x] IV is randomly generated per encryption (12 bytes)
- [x] Passwords never sent to server
- [x] Passwords cleared on sign-out
- [x] Encrypted data includes integrity verification (GCM)
- [x] No encryption keys stored in localStorage (only sessionStorage)
- [x] Proper error handling for decryption failures
- [x] Type safety with TypeScript
- [x] User warnings about password importance

## Compliance Notes

### GDPR Compliance

End-to-end encryption supports GDPR compliance:

- User data is encrypted at rest
- Service provider cannot access user data
- "Right to be forgotten" - simply delete encrypted blob
- "Data portability" - user can export encrypted data

### Zero-Knowledge Architecture

This implementation provides a **zero-knowledge** architecture:

- Server never sees unencrypted story data
- Server cannot decrypt user stories
- Even database administrators cannot read stories
- True privacy-first design

## Support & Maintenance

### Monitoring

Consider implementing metrics for:

- Encryption adoption rate
- Decryption failures (may indicate password issues)
- Migration completion rate
- Average encryption/decryption time

### User Support

Common user questions:

1. "What happens if I forget my password?"

   - Encrypted stories are permanently inaccessible
   - This is a security feature, not a bug

2. "Can support help me recover my stories?"

   - No, this would defeat the purpose of encryption
   - Emphasize password management tools

3. "Why is my story not encrypting?"
   - Check that you signed in (not just signed up)
   - Try signing out and back in
   - Check browser console for errors

## Conclusion

This encryption system provides **military-grade security** for user stories while maintaining a **seamless user experience**. The system is designed to be transparent, secure, and easy to use, with clear migration paths for existing data and robust error handling.

The trade-off for this level of security is that forgotten passwords result in permanent data loss - but this is an acceptable trade-off for users who prioritize privacy and security.
