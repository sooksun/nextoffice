-- Migration: add org fields (areaCode, phone, email, website, activeAcademicYearId)
-- Run once on production:
--   mysql -h 192.168.1.4 -u root -p nextoffice_db < apps/api/prisma/migrate-org-fields.sql

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS area_code              VARCHAR(100)  NULL AFTER district,
  ADD COLUMN IF NOT EXISTS phone                  VARCHAR(20)   NULL AFTER area_code,
  ADD COLUMN IF NOT EXISTS email                  VARCHAR(255)  NULL AFTER phone,
  ADD COLUMN IF NOT EXISTS website                VARCHAR(255)  NULL AFTER email,
  ADD COLUMN IF NOT EXISTS active_academic_year_id BIGINT UNSIGNED NULL AFTER website,
  ADD INDEX IF NOT EXISTS idx_org_active_year (active_academic_year_id);

-- Migrate registration_counters: year column was Gregorian (2025) → convert to Buddhist (2568)
-- Only migrate rows where year < 2500 (clearly Gregorian)
UPDATE registration_counters SET year = year + 543 WHERE year < 2500;

-- Link school to its education area (area_office org) using parentOrganizationId
-- If you already have area_office orgs, update schools manually:
--   UPDATE organizations SET parent_organization_id = <area_id> WHERE org_type = 'school' AND id = <school_id>;

-- Set active academic year for each org to the current global academic year
UPDATE organizations o
  JOIN academic_years ay ON ay.is_current = 1
SET o.active_academic_year_id = ay.id
WHERE o.active_academic_year_id IS NULL AND o.is_active = 1;
