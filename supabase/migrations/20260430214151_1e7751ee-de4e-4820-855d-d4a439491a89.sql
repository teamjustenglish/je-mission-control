-- 1. Update existing batch names to be just "{Month} {Year}"
UPDATE batches
SET name = (
  CASE month
    WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
    WHEN 4 THEN 'Apr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
    WHEN 7 THEN 'Jul' WHEN 8 THEN 'Aug' WHEN 9 THEN 'Sep'
    WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dec'
  END
) || ' ' || year::text;

-- 2. Update activity_log.batch_name for entries linked to a batch
UPDATE activity_log
SET batch_name = (
  SELECT (
    CASE b.month
      WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
      WHEN 4 THEN 'Apr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
      WHEN 7 THEN 'Jul' WHEN 8 THEN 'Aug' WHEN 9 THEN 'Sep'
      WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dec'
    END
  ) || ' ' || b.year::text
  FROM batches b WHERE b.id = activity_log.batch_id
)
WHERE batch_id IS NOT NULL;

-- 3. Drop the label column from batches
ALTER TABLE batches DROP COLUMN IF EXISTS label;
