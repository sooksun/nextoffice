-- Migration: create registration_counters + seed from existing inbound_cases
-- Run once on production after git pull:
--   mysql -h 192.168.1.4 -u root nextoffice_db < apps/api/prisma/migrate-registration-counter.sql

-- 1. Create table (safe to re-run)
CREATE TABLE IF NOT EXISTS `registration_counters` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `organization_id` BIGINT       NOT NULL,
  `year`            INT          NOT NULL,
  `last_seq`        INT          NOT NULL DEFAULT 0,
  `updated_at`      DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `registration_counters_organization_id_year_key` (`organization_id`, `year`),
  CONSTRAINT `registration_counters_org_fk`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Seed counter from existing registered cases
--    Uses GREATEST so re-running this is safe (will not decrease the counter)
INSERT INTO `registration_counters` (`organization_id`, `year`, `last_seq`, `updated_at`)
SELECT
  `organization_id`,
  YEAR(`registered_at`)                                                          AS `year`,
  MAX(CAST(SUBSTRING_INDEX(`registration_no`, '/', 1) AS UNSIGNED))             AS `last_seq`,
  NOW(3)
FROM `inbound_cases`
WHERE `registration_no` IS NOT NULL
  AND `registered_at`   IS NOT NULL
GROUP BY `organization_id`, YEAR(`registered_at`)
ON DUPLICATE KEY UPDATE
  `last_seq`   = GREATEST(`last_seq`, VALUES(`last_seq`)),
  `updated_at` = NOW(3);
