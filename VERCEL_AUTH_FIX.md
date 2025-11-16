# Vercel Authentication Fix

## Changes Made

### 1. Improved Supabase Client Configuration
- **File**: `app/misc/supabase.ts`
- **Changes**: Added explicit auth options for better session persistence:
  ```typescript
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  storage: localStorage
  ```

### 2. Created Authentication Helper
- **File**: `app/misc/getAuthToken.ts` (NEW)
- **Purpose**: Centralized helper for getting auth tokens and making authenticated requests
- **Functions**:
  - `getAuthToken()`: Safely retrieves current session token
  - `authenticatedFetch()`: Wrapper around fetch that automatically adds Authorization header

### 3. Updated Library Page
- **File**: `app/library/page.tsx`
- **Changes**: Replaced all manual session fetching with `authenticatedFetch()` helper
- **Benefits**: 
  - More reliable token retrieval
  - Consistent error handling
  - Cleaner code

## Vercel Environment Variables to Check

Make sure these are set in your Vercel project settings:

1. **NEXT_PUBLIC_SUPABASE_URL**
   - Value: Your Supabase project URL
   - Example: `https://xxxxx.supabase.co`

2. **NEXT_PUBLIC_SUPABASE_KEY**
   - Value: Your Supabase anon/public key
   - Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

3. **SUPABASE_URL** (server-side)
   - Same as NEXT_PUBLIC_SUPABASE_URL

4. **SUPABASE_KEY** (server-side)
   - Same as NEXT_PUBLIC_SUPABASE_KEY

5. **DEEPSEEK_API_KEY**
   - Your DeepSeek API key

## Supabase Configuration to Check

### 1. Site URL
In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: Set to your Vercel production URL
  - Example: `https://your-app.vercel.app`

### 2. Redirect URLs
Add these to **Redirect URLs**:
- `https://your-app.vercel.app/**`
- `https://*.vercel.app/**` (for preview deployments)

### 3. JWT Expiry
Check Authentication → Settings:
- **JWT expiry limit**: Default is 3600 seconds (1 hour)
- Consider increasing if users frequently get logged out

## Troubleshooting

### If authentication still fails:

1. **Check Browser Console**
   - Look for CORS errors
   - Check if localStorage is accessible
   - Verify Supabase client initialization

2. **Check Vercel Logs**
   ```bash
   vercel logs your-app-name --follow
   ```
   - Look for "No session found" or "Unauthorized" errors
   - Check if environment variables are loaded

3. **Test Session Persistence**
   - Open browser dev tools → Application → Local Storage
   - Look for `supabase.auth.token` entries
   - If missing, localStorage might be blocked

4. **Verify API Route Authentication**
   - Test with curl:
     ```bash
     curl -H "Authorization: Bearer YOUR_TOKEN" \
       https://your-app.vercel.app/api/folders
     ```

5. **Check Supabase RLS Policies**
   - Ensure policies allow authenticated users to access their own data
   - Test in Supabase SQL editor with `SELECT auth.uid()`

## Deploy Instructions

1. **Commit Changes**
   ```bash
   git add .
   git commit -m "Fix authentication for Vercel production"
   git push
   ```

2. **Vercel will auto-deploy**
   - Or manually: `vercel --prod`

3. **Test After Deploy**
   - Log in to your production site
   - Try accessing Library page
   - Check browser console for errors

## Common Issues

### Issue: "No session found"
**Solution**: User needs to log out and log back in to get a fresh session token.

### Issue: Session expires too quickly
**Solution**: Supabase auto-refreshes tokens. Check if `autoRefreshToken: true` is set.

### Issue: CORS errors
**Solution**: Verify Supabase Site URL and Redirect URLs are configured correctly.

### Issue: localStorage not available
**Solution**: 
- Check if third-party cookies are blocked
- Verify site is served over HTTPS
- Consider cookie-based storage instead

## Files Modified

1. ✅ `app/misc/supabase.ts` - Enhanced client config
2. ✅ `app/misc/getAuthToken.ts` - NEW helper file
3. ✅ `app/library/page.tsx` - Uses authenticatedFetch
4. ✅ `next.config.ts` - Added Supabase image domain

## Next Steps

If issues persist:
1. Check Supabase logs (Dashboard → Logs)
2. Enable verbose logging in Supabase client
3. Contact support with specific error messages
