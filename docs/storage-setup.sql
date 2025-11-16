-- Create Supabase Storage bucket for adventure images
-- Run this in your Supabase SQL Editor

-- Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('adventure-images', 'adventure-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Allow authenticated users to upload adventure images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'adventure-images');

-- Allow anyone to view images (public bucket)
CREATE POLICY "Allow public to view adventure images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'adventure-images');

-- Allow users to delete their own images
-- This assumes files are stored under a per-user folder, e.g. '<user_id>/...'
CREATE POLICY "Allow users to delete their own adventure images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
	bucket_id = 'adventure-images'
	AND auth.uid()::text = (storage.foldername(name))[1]
);
