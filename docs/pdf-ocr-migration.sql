-- Create Supabase Storage bucket for temporary PDF uploads
-- PDFs are uploaded for OCR processing and deleted after processing
-- Run this in your Supabase SQL Editor

-- Create the bucket for temporary PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-temp',
  'pdf-temp',
  false, -- Private bucket - only accessible via signed URLs
  52428800, -- 50MB max file size
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

-- Allow authenticated users to upload PDFs
CREATE POLICY "Allow authenticated users to upload PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pdf-temp');

-- Allow users to read their own uploaded PDFs (needed for signed URLs)
CREATE POLICY "Allow users to read their own PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdf-temp'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own PDFs
CREATE POLICY "Allow users to delete their own PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'pdf-temp'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Optional: Create a scheduled function to clean up old PDFs (older than 24 hours)
-- This requires pg_cron extension to be enabled
-- Uncomment if you have pg_cron available:

/*
-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_pdfs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'pdf-temp'
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- Schedule cleanup to run every hour
SELECT cron.schedule(
  'cleanup-pdf-temp',
  '0 * * * *', -- Every hour
  'SELECT cleanup_old_pdfs()'
);
*/

-- Alternative: Manual cleanup query (run periodically via admin panel or external cron)
-- DELETE FROM storage.objects WHERE bucket_id = 'pdf-temp' AND created_at < NOW() - INTERVAL '24 hours';
