-- Seed registration_counters from existing inbound_cases
-- This sets lastSeq = MAX existing sequence per org per Gregorian year,
-- so the counter continues from where the data already is.
INSERT INTO registration_counters (organization_id, year, last_seq, updated_at)
SELECT
  organization_id,
  YEAR(registered_at)                                                        AS year,
  MAX(CAST(SUBSTRING_INDEX(registration_no, '/', 1) AS UNSIGNED))           AS last_seq,
  NOW()
FROM inbound_cases
WHERE registration_no IS NOT NULL
  AND registered_at   IS NOT NULL
GROUP BY organization_id, YEAR(registered_at)
ON DUPLICATE KEY UPDATE
  last_seq   = GREATEST(last_seq, VALUES(last_seq)),
  updated_at = NOW();
