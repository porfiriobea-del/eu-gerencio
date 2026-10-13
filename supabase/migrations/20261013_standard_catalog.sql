-- Adds full product metadata to the existing product mirror.
-- Run once in the Supabase SQL Editor before using the standard catalogue button.
-- This migration preserves existing permissions and RLS policies.
ALTER TABLE public."PRODUTOS"
  ADD COLUMN IF NOT EXISTS catalog_owner_id text,
  ADD COLUMN IF NOT EXISTS catalog_key text,
  ADD COLUMN IF NOT EXISTS catalog_data jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS produtos_catalog_owner_key
  ON public."PRODUTOS" (catalog_owner_id, catalog_key);
