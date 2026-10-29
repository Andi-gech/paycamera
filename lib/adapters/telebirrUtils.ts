// lib/adapters/telebirrUtils.ts

export const FORBIDDEN_WORDS = new Set([
  'CLOUDFLARE',
  'SUCCESSFUL',
  'SUCCESS',
  'COMPLETED',
  'COMPLETE',
  'FAILED',
  'PENDING',
  'CANCELLED',
  'RECEIPT',
  'REFERENCE',
  'TRANSACTION',
  'TELEBIRR',
  'ETHIOTELECOM',
  'AMOUNT',
  'STATUS',
  'TRANSFER',
  'FINISHED',
]);

/**
 * Strict validator for Telebirr transaction reference.
 * Rule: Telebirr references are 10-character alphanumeric codes (e.g. DJQ8BX9KE6).
 * Must contain BOTH digits and letters.
 * - Never count full numbers (e.g. 1000123456 or phone numbers).
 * - Never count full alphabet (e.g. SUCCESSFUL, TRANSFERSB).
 * - Never match CBE references (starting with FT).
 */
export function isValidTelebirrRef(ref: string | null | undefined): boolean {
  if (!ref || typeof ref !== 'string') return false;
  const clean = ref.trim().toUpperCase();

  // Standard length is 10 chars (allow 9 to 12 for OCR spacing/variations)
  if (clean.length < 9 || clean.length > 12) return false;

  // Must only contain alphanumeric characters
  if (!/^[A-Z0-9]+$/.test(clean)) return false;

  // Do NOT count full number (all digits)
  if (/^\d+$/.test(clean)) return false;

  // Do NOT count full alphabet (all letters)
  if (/^[A-Z]+$/.test(clean)) return false;

  // Must contain at least one letter AND at least one digit
  if (!(/[A-Z]/.test(clean) && /\d/.test(clean))) return false;

  // CBE transaction references start with FT
  if (clean.startsWith('FT')) return false;

  // Must not be forbidden keywords
  if (FORBIDDEN_WORDS.has(clean)) return false;

  return true;
}

/**
 * Extracts a valid Telebirr reference from raw text / OCR string.
 * Discards any candidates that are purely numeric or purely alphabetical.
 */
export function extractTelebirrRefFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Direct Ethio Telecom URL check
  const urlMatch = text.match(/transactioninfo\.ethiotelecom\.et\/receipt\/([A-Za-z0-9]+)/i);
  if (urlMatch && isValidTelebirrRef(urlMatch[1])) {
    return urlMatch[1].toUpperCase();
  }

  // 2. Labeled transaction reference (e.g. "Transaction No: DJQ8BX9KE6", "የግብይት ቁጥር: ...")
  const labeledRegex = /(?:transaction\s*(?:number|no|id)|txnid|ref(?:erence)?\s*(?:no|number)?|የግብይት\s*ቁጥር|የክፍያ\s*ቁጥር)[:\s]+([A-Za-z0-9]{9,12})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = labeledRegex.exec(text)) !== null) {
    if (isValidTelebirrRef(match[1])) {
      return match[1].toUpperCase();
    }
  }

  // 3. Telebirr pattern starting with 'D' (e.g. DJ..., DK..., etc.)
  const prefixRegex = /\b(D[A-Za-z0-9]{9})\b/gi;
  while ((match = prefixRegex.exec(text)) !== null) {
    if (isValidTelebirrRef(match[1])) {
      return match[1].toUpperCase();
    }
  }

  // 4. Any 10-character token with mixed letters and numbers
  const tokenRegex = /\b([A-Za-z0-9]{10})\b/gi;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (isValidTelebirrRef(match[1])) {
      return match[1].toUpperCase();
    }
  }

  return null;
}
