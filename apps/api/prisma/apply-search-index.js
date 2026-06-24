/**
 * Apply the portable trigram FULLTEXT search maintenance objects.
 *
 * Creates the `fn_search_trigrams` stored function + BEFORE INSERT/UPDATE
 * triggers on inbound_cases / documents / users, then backfills search_text.
 * Idempotent — safe to re-run (every object is DROP ... IF EXISTS first).
 *
 * Run AFTER `prisma db push` (which adds the search_text columns + FULLTEXT
 * indexes). The triggers/function live outside Prisma's schema, so db push does
 * NOT manage them — re-run this whenever the DB is freshly pushed/reset.
 *
 *   node -r dotenv/config prisma/apply-search-index.js
 *   (or: npm run search:index)
 *
 * Each statement is sent on its own, so no DELIMITER handling is needed —
 * the server parses each CREATE FUNCTION/TRIGGER (incl. BEGIN..END) as one
 * statement. Works against MySQL 8 (dev) and MariaDB 11 (prod).
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_URL = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/nextoffice_db';

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

// Keep the REPLACE() chain identical to SEPARATORS in src/search/search-trigram.util.ts
const FN = `
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
  SET v = REPLACE(v, '\\t', ' ');
  SET v = REPLACE(v, '\\n', ' ');
  SET v = REPLACE(v, '\\r', ' ');
  SET v = REPLACE(v, '/', ' ');
  SET v = REPLACE(v, '\\\\', ' ');
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
END`;

const STATEMENTS = [
  'DROP FUNCTION IF EXISTS fn_search_trigrams',
  FN,

  'DROP TRIGGER IF EXISTS trg_inbound_cases_search_ins',
  `CREATE TRIGGER trg_inbound_cases_search_ins BEFORE INSERT ON inbound_cases
   FOR EACH ROW SET NEW.search_text = fn_search_trigrams(CONCAT_WS(' ', NEW.title, NEW.registration_no))`,
  'DROP TRIGGER IF EXISTS trg_inbound_cases_search_upd',
  `CREATE TRIGGER trg_inbound_cases_search_upd BEFORE UPDATE ON inbound_cases
   FOR EACH ROW BEGIN
     IF NOT (NEW.title <=> OLD.title AND NEW.registration_no <=> OLD.registration_no) THEN
       SET NEW.search_text = fn_search_trigrams(CONCAT_WS(' ', NEW.title, NEW.registration_no));
     END IF;
   END`,

  'DROP TRIGGER IF EXISTS trg_documents_search_ins',
  `CREATE TRIGGER trg_documents_search_ins BEFORE INSERT ON documents
   FOR EACH ROW SET NEW.search_text = fn_search_trigrams(NEW.title)`,
  'DROP TRIGGER IF EXISTS trg_documents_search_upd',
  `CREATE TRIGGER trg_documents_search_upd BEFORE UPDATE ON documents
   FOR EACH ROW BEGIN
     IF NOT (NEW.title <=> OLD.title) THEN
       SET NEW.search_text = fn_search_trigrams(NEW.title);
     END IF;
   END`,

  'DROP TRIGGER IF EXISTS trg_users_search_ins',
  `CREATE TRIGGER trg_users_search_ins BEFORE INSERT ON users
   FOR EACH ROW SET NEW.search_text = fn_search_trigrams(CONCAT_WS(' ', NEW.full_name, NEW.email))`,
  'DROP TRIGGER IF EXISTS trg_users_search_upd',
  `CREATE TRIGGER trg_users_search_upd BEFORE UPDATE ON users
   FOR EACH ROW BEGIN
     IF NOT (NEW.full_name <=> OLD.full_name AND NEW.email <=> OLD.email) THEN
       SET NEW.search_text = fn_search_trigrams(CONCAT_WS(' ', NEW.full_name, NEW.email));
     END IF;
   END`,
];

const BACKFILL = [
  ["inbound_cases", "UPDATE inbound_cases SET search_text = fn_search_trigrams(CONCAT_WS(' ', title, registration_no))"],
  ["documents", "UPDATE documents SET search_text = fn_search_trigrams(title)"],
  ["users", "UPDATE users SET search_text = fn_search_trigrams(CONCAT_WS(' ', full_name, email))"],
];

(async () => {
  const conn = await mysql.createConnection({ ...parseDbUrl(DB_URL), multipleStatements: false });
  try {
    for (const sql of STATEMENTS) {
      await conn.query(sql);
    }
    console.log('Function + triggers installed.');
    for (const [name, sql] of BACKFILL) {
      const [res] = await conn.query(sql);
      console.log(`Backfilled ${name}: ${res.affectedRows} rows`);
    }
    console.log('search-index applied successfully.');
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('apply-search-index failed:', err.message);
  process.exit(1);
});
