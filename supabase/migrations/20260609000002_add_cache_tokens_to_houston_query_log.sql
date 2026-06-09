-- Add prompt-caching token columns to houston_query_log.
-- Required for accurate cost accounting after enabling Anthropic prompt caching.
-- cache_creation_tokens: tokens written to cache on first call (billed at 125% of base input rate)
-- cache_read_tokens: tokens read from cache on subsequent calls (billed at 10% of base input rate)
ALTER TABLE public.houston_query_log
  ADD COLUMN cache_creation_tokens INTEGER,
  ADD COLUMN cache_read_tokens INTEGER;
