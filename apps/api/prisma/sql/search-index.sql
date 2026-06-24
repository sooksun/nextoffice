-- ============================================================================
-- Portable trigram FULLTEXT search maintenance (Thai-friendly).
--
-- Run AFTER `prisma db push` (which creates the search_text columns + FULLTEXT
-- indexes from the @@fulltext directives in schema.prisma). The objects below
-- live OUTSIDE Prisma's schema, so db push does not manage them — re-apply
-- after any fresh push/reset.
--
-- Default-parser FULLTEXT (no ngram) → works on MySQL 8 (dev) AND MariaDB 11
-- (prod). Thai text is pre-tokenized into 3-char windows; trigrams are length 3
-- to clear innodb_ft_min_token_size (default 3 on both engines).
--
-- This is the human-readable / CLI version. The app applies the same objects
-- programmatically via prisma/apply-search-index.js (npm run search:index),
-- which needs no DELIMITER handling. Keep the REPLACE() chain identical to
-- SEPARATORS in src/search/search-trigram.util.ts.
--
-- Manual apply (CLI):
--   mysql -uroot nextoffice_db < prisma/sql/search-index.sql      (dev, MySQL 8)
--   mariadb -h <host> -uroot -p <db> < prisma/sql/search-index.sql (prod, MariaDB)
-- ============================================================================

DELIMITER $$

DROP FUNCTION IF EXISTS fn_search_trigrams $$
CREATE FUNCTION fn_search_trigrams(input TEXT) RETURNS TEXT
DETERMINISTIC
NO SQL
BEGIN
  DECLARE v TEXT;
  DECLARE out_text TEXT DEFAULT '';
  DECLARE i INT DEFAULT 1;
  DECLARE n INT;
  DECLARE tri VARCHAR(16);
  IF input IS NULL THEN RETURN NULL; END IF;
  SET v = LOWER(input);
  SET v = REPLACE(v, '\t', ' ');
  SET v = REPLACE(v, '\n', ' ');
  SET v = REPLACE(v, '\r', ' ');
  SET v = REPLACE(v, '/', ' ');
  SET v = REPLACE(v, '\\', ' ');
  SET v = REPLACE(v, '-', ' ');
  SET v = REPLACE(v, '_', ' ');
  SET v = REPLACE(v, '.', ' ');
  SET v = REPLACE(v, ',', ' ');
  SET v = REPLACE(v, '@', ' ');
  SET v = REPLACE(v, '(', ' ');
  SET v = REPLACE(v, ')', ' ');
  SET v = REPLACE(v, ':', ' ');
  SET v = REPLACE(v, ';', ' ');
  SET v = REPLACE(v, '+', ' ');
  SET v = REPLACE(v, '*', ' ');
  SET v = REPLACE(v, '~', ' ');
  SET v = REPLACE(v, '<', ' ');
  SET v = REPLACE(v, '>', ' ');
  SET v = REPLACE(v, '"', ' ');
  SET v = REPLACE(v, '''', ' ');
  SET v = REPLACE(v, '?', ' ');
  SET v = REPLACE(v, '!', ' ');
  SET v = REPLACE(v, '#', ' ');
  SET v = REPLACE(v, '&', ' ');
  SET v = REPLACE(v, '=', ' ');
  SET v = REPLACE(v, '[', ' ');
  SET v = REPLACE(v, ']', ' ');
  SET v = REPLACE(v, '{', ' ');
  SET v = REPLACE(v, '}', ' ');
  SET v = REPLACE(v, '|', ' ');
  SET n = CHAR_LENGTH(v);
  WHILE i <= n - 2 DO
    SET tri = SUBSTRING(v, i, 3);
    IF LOCATE(' ', tri) = 0 THEN
      SET out_text = CONCAT(out_text, tri, ' ');
    END IF;
    SET i = i + 1;
  END WHILE;
  RETURN out_text;
END $$

-- ─── inbound_cases (title + registration_no) ───
DROP TRIGGER IF EXISTS trg_inbound_cases_search_ins $$
CREATE TRIGGER trg_inbound_cases_search_ins BEFORE INSERT ON inbound_cases
FOR EACH ROW SET NEW.search_text = fn_search_trigrams(CONCAT_WS(' ', NEW.title, NEW.registration_no)) $$

DROP TRIGGER IF EXISTS trg_inbound_cases_search_upd $$
CREATE TRIGGER trg_inbound_cases_search_upd BEFORE UPDATE ON inbound_cases
FOR EACH ROW BEGIN
  IF NOT (NEW.title <=> OLD.title AND NEW.registration_no <=> OLD.registration_no) THEN
    SET NEW.search_text = fn_search_trigrams(CONCAT_WS(' ', NEW.title, NEW.registration_no));
  END IF;
END $$

-- ─── documents (title) ───
DROP TRIGGER IF EXISTS trg_documents_search_ins $$
CREATE TRIGGER trg_documents_search_ins BEFORE INSERT ON documents
FOR EACH ROW SET NEW.search_text = fn_search_trigrams(NEW.title) $$

DROP TRIGGER IF EXISTS trg_documents_search_upd $$
CREATE TRIGGER trg_documents_search_upd BEFORE UPDATE ON documents
FOR EACH ROW BEGIN
  IF NOT (NEW.title <=> OLD.title) THEN
    SET NEW.search_text = fn_search_trigrams(NEW.title);
  END IF;
END $$

-- ─── users (full_name + email) ───
DROP TRIGGER IF EXISTS trg_users_search_ins $$
CREATE TRIGGER trg_users_search_ins BEFORE INSERT ON users
FOR EACH ROW SET NEW.search_text = fn_search_trigrams(CONCAT_WS(' ', NEW.full_name, NEW.email)) $$

DROP TRIGGER IF EXISTS trg_users_search_upd $$
CREATE TRIGGER trg_users_search_upd BEFORE UPDATE ON users
FOR EACH ROW BEGIN
  IF NOT (NEW.full_name <=> OLD.full_name AND NEW.email <=> OLD.email) THEN
    SET NEW.search_text = fn_search_trigrams(CONCAT_WS(' ', NEW.full_name, NEW.email));
  END IF;
END $$

DELIMITER ;

-- ─── Backfill existing rows ───
UPDATE inbound_cases SET search_text = fn_search_trigrams(CONCAT_WS(' ', title, registration_no));
UPDATE documents     SET search_text = fn_search_trigrams(title);
UPDATE users         SET search_text = fn_search_trigrams(CONCAT_WS(' ', full_name, email));
