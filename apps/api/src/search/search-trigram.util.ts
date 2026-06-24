/**
 * Trigram tokenizer for portable FULLTEXT search (Thai-friendly).
 *
 * Thai has no word boundaries, and neither MySQL's default parser nor MariaDB
 * supports the `ngram` parser. So we pre-tokenize text into 3-character windows
 * stored in a `search_text` column with a default-parser FULLTEXT index that
 * works on BOTH MySQL 8 (dev) and MariaDB 11 (prod).
 *
 * This MUST stay byte-for-byte in sync with the SQL function `fn_search_trigrams`
 * in prisma/sql/search-index.sql — the stored function indexes rows, this file
 * builds the query, and a mismatch means missed matches.
 *
 * Trigrams (length 3) are used because innodb_ft_min_token_size defaults to 3 on
 * both engines; 2-char tokens would be silently dropped from the index.
 */

// Characters treated as token separators (replaced with a space before
// windowing). Covers whitespace, common punctuation in titles/registration
// numbers/emails, and every BOOLEAN-MODE operator so trigrams never contain
// one. Keep identical to the REPLACE() chain in fn_search_trigrams.
const SEPARATORS = new Set(
  ['\t', '\n', '\r', '/', '\\', '-', '_', '.', ',', '@', '(', ')', ':', ';',
   '+', '*', '~', '<', '>', '"', "'", '?', '!', '#', '&', '=', '[', ']', '{', '}', '|'],
);

function normalize(input: string): string {
  let out = '';
  for (const ch of input.toLowerCase()) {
    out += SEPARATORS.has(ch) ? ' ' : ch;
  }
  return out;
}

/** Sliding 3-char windows within each whitespace-delimited token. */
function trigramTokens(input: string): string[] {
  const out: string[] = [];
  for (const token of normalize(input).split(' ')) {
    if (token.length < 3) continue;
    for (let i = 0; i <= token.length - 3; i++) {
      out.push(token.slice(i, i + 3));
    }
  }
  return out;
}

/**
 * Build the BOOLEAN-MODE query string for a search term, e.g.
 * "ราชการ" → "+ราช +าชก +ชกา +การ" (every trigram required → substring match).
 * Returns null when the term yields no trigram (length < 3 after normalizing),
 * signalling the caller to fall back to a plain `contains` scan.
 */
export function buildTrigramBooleanQuery(term: string): string | null {
  const tokens = Array.from(new Set(trigramTokens(term)));
  if (tokens.length === 0) return null;
  return tokens.map((t) => `+${t}`).join(' ');
}
