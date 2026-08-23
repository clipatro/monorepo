import { createHash } from "node:crypto";

// === Canonicalization for exact duplicate detection ===

function canonicalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalHash(text: string): string {
  return createHash("sha256").update(canonicalize(text)).digest("hex");
}

// === FTS5 query sanitization ===

/**
 * Sanitize a text string for use as an FTS5 MATCH query.
 * FTS5 treats double quotes, asterisks, parentheses, colons, and other
 * characters as special syntax. To safely search arbitrary text, we split
 * into tokens, wrap each in double quotes (escaping internal quotes), and
 * join with OR. Returns empty string if no valid tokens remain.
 */
function sanitizeFtsQuery(text: string): string {
  const tokens = text
    .split(/[\s,.;:!?()[\]{}|&*^"'~+/\\<>]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2);
  if (tokens.length === 0) return "";
  // Wrap each token in escaped double quotes and join with OR
  return tokens.map(t => `"${t.replace(/"/g, '""')}"`).slice(0, 20).join(" OR ");
}

export { canonicalize, canonicalHash, sanitizeFtsQuery };
